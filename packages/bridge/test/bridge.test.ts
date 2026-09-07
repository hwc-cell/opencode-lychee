import { afterEach, describe, expect, test } from "bun:test"
import { deliverMessage, enqueue, isQueued, type BotSdk } from "../src/bot"
import { handleChatCommand } from "../src/commands"
import { chunkText, loginUntilConfirmed, messageText } from "../src/weixin/client"

const fetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = fetch
})

describe("queue", () => {
  test("removes idle keys", async () => {
    let done = () => {}
    const wait = new Promise<void>((resolve) => {
      done = resolve
    })
    const run = enqueue("user", () => wait)
    expect(isQueued("user")).toBe(true)
    done()
    await run
    await Promise.resolve()
    expect(isQueued("user")).toBe(false)
  })

  test("reads the newest assistant messages", async () => {
    const orders: string[] = []
    const sdk = {
      v2: {
        model: { list: async () => [] },
        session: {
          create: async () => ({}),
          prompt: async () => ({}),
          switchModel: async () => ({}),
          wait: async () => ({}),
          interrupt: async () => ({}),
          messages: async (args: { order?: "asc" | "desc" }) => {
            orders.push(args.order ?? "")
            return { data: { data: [{ type: "assistant", content: [{ type: "text", text: "latest" }] }] } }
          },
        },
      },
    } as BotSdk
    const replies: string[] = []

    await deliverMessage({
      sdk,
      sessionID: "session",
      text: "hello",
      reply: async (text) => {
        replies.push(text)
      },
      log: () => {},
    })

    expect(orders.length).toBeGreaterThan(0)
    expect(orders.every((order) => order === "desc")).toBe(true)
    expect(replies).toContain("latest")
  })
})

describe("weixin client", () => {
  test("does not split surrogate pairs", () => {
    expect(chunkText("a😀b", 2)).toEqual(["a", "😀", "b"])
  })

  test("stops after four expired QR codes", async () => {
    let id = 0
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes("get_bot_qrcode")) {
        id += 1
        return Response.json({ qrcode: `qr-${id}`, qrcode_img_content: `https://example.com/${id}` })
      }
      return Response.json({ status: "expired" })
    }) as typeof globalThis.fetch

    await expect(loginUntilConfirmed({})).rejects.toThrow("二维码连续过期")
    expect(id).toBe(4)
  })

  test("waits until the QR code has rendered before polling", async () => {
    const order: string[] = []
    globalThis.fetch = (async (input) => {
      if (String(input).includes("get_bot_qrcode")) {
        return Response.json({ qrcode: "qr", qrcode_img_content: "https://example.com/qr" })
      }
      order.push("poll")
      return Response.json({
        status: "confirmed",
        bot_token: "token",
        ilink_bot_id: "bot",
        ilink_user_id: "user",
      })
    }) as typeof globalThis.fetch

    await loginUntilConfirmed({
      onQr: async () => {
        order.push("render-start")
        await Promise.resolve()
        order.push("render-end")
      },
    })

    expect(order).toEqual(["render-start", "render-end", "poll"])
  })

  test("combines text items and falls back to voice transcripts", () => {
    expect(messageText({ item_list: [{ type: 1, text_item: { text: "one" } }, { type: 1, text_item: { text: "two" } }] })).toBe(
      "one\ntwo",
    )
    expect(messageText({ item_list: [{ type: 3, voice_item: { text: "voice" } }] })).toBe("voice")
    expect(messageText({ item_list: [{ type: 2, image_item: {} }] })).toBeUndefined()
  })
})

describe("chat commands", () => {
  test("matches a provider/model id and supports help", async () => {
    let model = ""
    const args = {
      channel: "weixin",
      fromUserId: "owner",
      ownerUserId: "owner",
      workDir: "/tmp",
      reply: async () => {},
      log: () => {},
      models: {
        list: async () => [{ id: "model", providerID: "provider", name: "Display Name" }],
        switchModel: async (next: { id: string; providerID: string }) => {
          model = `${next.providerID}/${next.id}`
          return true
        },
      },
    }

    expect(await handleChatCommand({ ...args, text: "/model provider/model" })).toBe(true)
    expect(model).toBe("provider/model")
    expect(await handleChatCommand({ ...args, text: "/help" })).toBe(true)
  })
})
