import { afterEach, describe, expect, jest, test } from "bun:test"
import { keepTyping } from "../src/activity"
import { handleChatCommand } from "../src/commands"
import { chunkText, sendChunked } from "../src/text"
import { sendText, sendTyping } from "../src/weixin/client"

afterEach(() => jest.useRealTimers())

describe("channel replies", () => {
  test.each([0, 1, -1, 2.5, NaN, Infinity])("rejects invalid chunk limit %s", (limit) => {
    expect(() => chunkText("😀hello", limit)).toThrow(RangeError)
  })

  test("keeps paragraphs and emoji intact", () => {
    const text = "荔枝😀\n\n".repeat(800)
    const chunks = chunkText(text, 17)
    expect(chunks.join("")).toBe(text)
    expect(chunks.every((chunk) => chunk.length <= 17 && chunk.isWellFormed())).toBe(true)
  })

  test("does not hang or drop unpaired input surrogates", () => {
    const text = "\ud800\nabcdefgh"
    expect(chunkText(text, 2).join("")).toBe(text)
  })

  test("includes numbering within the limit when the number of chunks grows", async () => {
    const text = "😀荔枝".repeat(300)
    const sent: string[] = []
    await sendChunked(
      text,
      async (part) => {
        sent.push(part)
      },
      20,
    )
    expect(sent.length).toBeGreaterThan(99)
    expect(sent.every((part) => part.length <= 20 && part.isWellFormed())).toBe(true)
    expect(sent.map((part) => part.replace(/^\(\d+\/\d+\) /, "")).join("")).toBe(text)
  })

  test("sends long model lists through the real HTTP client in bounded chunks", async () => {
    const sent: string[] = []
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request) => {
        const body = (await request.json()) as { msg: { item_list: { text_item: { text: string } }[] } }
        sent.push(body.msg.item_list[0].text_item.text)
        return Response.json({ ret: 0 })
      },
    })
    try {
      const models = Array.from({ length: 120 }, (_, i) => ({
        id: `model-${i}`,
        providerID: "provider",
        name: `模型 ${i} 😀`,
      }))
      expect(
        await handleChatCommand({
          channel: "weixin",
          text: "/model",
          fromUserId: "test",
          workDir: "/tmp",
          log: () => {},
          models: { list: async () => models, switchModel: async () => true },
          reply: (text) =>
            sendChunked(text, (part) =>
              sendText({
                token: "fixture",
                baseUrl: server.url.origin,
                toUserId: "test",
                contextToken: "fixture",
                text: part,
              }),
            ),
        }),
      ).toBe(true)
      expect(sent.length).toBeGreaterThan(1)
      expect(sent.every((text) => text.length <= 2000 && text.isWellFormed())).toBe(true)
      expect(sent.join("")).toContain("model-119")
    } finally {
      server.stop(true)
    }
  })

  test("stops sending subsequent chunks when delivery fails", async () => {
    const sent: string[] = []
    await expect(
      sendChunked(
        "a".repeat(100),
        async (part) => {
          sent.push(part)
          if (sent.length === 2) throw new Error("offline")
        },
        20,
      ),
    ).rejects.toThrow("offline")
    expect(sent).toHaveLength(2)
  })
})

describe("typing activity", () => {
  test("does not overlap requests and cancels before clearing activity", async () => {
    jest.useFakeTimers()
    const statuses: number[] = []
    const stop = keepTyping((status, signal) => {
      statuses.push(status)
      if (status === 2) return Promise.resolve()
      return new Promise<void>((resolve) => signal!.addEventListener("abort", () => resolve(), { once: true }))
    })
    try {
      expect(statuses).toEqual([1])
      jest.advanceTimersToNextTimer()
      jest.advanceTimersToNextTimer()
      expect(statuses).toEqual([1])
    } finally {
      await stop()
    }
    expect(statuses).toEqual([1, 2])
    jest.runOnlyPendingTimers()
    expect(statuses).toEqual([1, 2])
  })

  test("refreshes after a completed request and tolerates network failure", async () => {
    jest.useFakeTimers()
    const statuses: number[] = []
    const stop = keepTyping(async (status) => {
      statuses.push(status)
      throw new Error("offline")
    })
    try {
      // Let the completed request release its slot before the next interval.
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      jest.advanceTimersToNextTimer()
      expect(statuses).toEqual([1, 1])
    } finally {
      await stop()
    }
    expect(statuses).toEqual([1, 1, 2])
  })

  test("cancels the real HTTP request before it can send a late typing indicator", async () => {
    const arrived = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const paths: string[] = []
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request) => {
        paths.push(new URL(request.url).pathname)
        arrived.resolve()
        await release.promise
        return Response.json({ typing_ticket: "fixture" })
      },
    })
    const abort = new AbortController()
    const request = sendTyping({
      token: "fixture",
      baseUrl: server.url.origin,
      userId: "test",
      status: 1,
      signal: abort.signal,
    })
    try {
      await arrived.promise
      abort.abort()
      await request
      expect(paths).toEqual(["/ilink/bot/getconfig"])
    } finally {
      abort.abort()
      release.resolve()
      await request
      server.stop(true)
    }
  })
})
