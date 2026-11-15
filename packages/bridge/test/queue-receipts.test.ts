import { describe, expect, test } from "bun:test"
import { OpenCode } from "@opencode/client"
import { cancelQueued, cancelQueuedTask, deliverMessage, enqueue, isQueued, queuedTasks } from "../src/bot"
import { formatReceipt, turnReceipt, type ReceiptMessage, type TurnReceipt } from "../src/receipt"
import { makeBotSdk } from "../src/weixin/bridge"

describe("visible task queues", () => {
  test("cancels one waiting task while preserving the running task and later tasks", async () => {
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const ran: string[] = []
    const first = enqueue(
      "selective",
      async () => {
        started.resolve()
        await release.promise
        ran.push("first")
      },
      { text: "First" },
    )
    const second = enqueue(
      "selective",
      async () => {
        ran.push("second")
      },
      { text: "Second" },
    )
    const third = enqueue(
      "selective",
      async () => {
        ran.push("third")
      },
      { text: "Third" },
    )
    await started.promise
    const rows = queuedTasks("selective")
    expect(rows.map((row) => [row.text, row.running])).toEqual([
      ["First", true],
      ["Second", false],
      ["Third", false],
    ])
    expect(cancelQueuedTask("selective", rows[0].id)).toBe(false)
    expect(cancelQueuedTask("another-chat", rows[1].id)).toBe(false)
    expect(cancelQueuedTask("selective", rows[1].id)).toBe(true)
    expect(cancelQueuedTask("selective", rows[1].id)).toBe(false)
    release.resolve()
    await Promise.all([first, second, third])
    expect(ran).toEqual(["first", "third"])
    expect(queuedTasks("selective")).toEqual([])
    expect(isQueued("selective")).toBe(false)
  })

  test("stop invalidates waiting work without blocking new work or other chats", async () => {
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const ran: string[] = []
    const first = enqueue("stop-one", async (cancelled) => {
      started.resolve()
      await release.promise
      expect(cancelled()).toBe(true)
    })
    const waiting = enqueue("stop-one", async () => {
      ran.push("cancelled")
    })
    await started.promise
    expect(cancelQueued("stop-one")).toBe(true)
    const fresh = enqueue("stop-one", async () => {
      ran.push("fresh")
    })
    await enqueue("other-chat", async () => {
      ran.push("other")
    })
    release.resolve()
    await Promise.all([first, waiting, fresh])
    expect(ran).toEqual(["other", "fresh"])
    expect(queuedTasks("stop-one")).toEqual([])
    expect(isQueued("stop-one")).toBe(false)
  })

  test("a failed task is removed and does not poison its queue", async () => {
    const failed = enqueue("failed-entry", async () => {
      throw new Error("failure")
    })
    const next = enqueue("failed-entry", async () => "done")
    await expect(failed).rejects.toThrow("failure")
    expect(await next).toBe("done")
    expect(queuedTasks("failed-entry")).toEqual([])
  })
})

function tool(name: string, command: string, metadata: Record<string, unknown> = { exit: 0, status: "completed" }) {
  return { type: "tool", name, state: { status: "completed", input: { command }, metadata } }
}

describe("recorded completion receipts", () => {
  test("collects actual file mutations, checks and Git exits without trusting assistant prose", () => {
    const receipt = turnReceipt(
      [
        {
          snapshot: { files: ["src/index.ts"] },
          cost: 0.04,
          content: [
            { type: "text", text: "All 999 tests passed; committed and pushed!" },
            {
              type: "tool",
              name: "edit",
              state: {
                status: "completed",
                input: { path: "src/index.ts" },
                metadata: { files: [{ file: "README.md" }] },
              },
            },
            { type: "tool", name: "write", state: { status: "error", input: { path: "failed.ts" } } },
            tool("shell", "bun test test/bridge.test.ts"),
            tool("shell", "bun run typecheck", { exit: 1, status: "completed" }),
            tool("shell", "git commit -m 'change'"),
            tool("shell", "git push", { exit: 1, status: "completed" }),
          ],
        },
      ],
      1234,
    )
    expect(receipt.files).toEqual(["src/index.ts", "README.md"])
    expect(receipt.tools).toEqual({ completed: 5, failed: 1 })
    expect(receipt.checks).toEqual([
      { command: "bun test", status: "passed" },
      { command: "bun run typecheck", status: "failed" },
    ])
    expect(receipt.git).toEqual({ commit: "succeeded", push: "failed" })
    expect(receipt.costUSD).toBe(0.04)
    expect(formatReceipt(receipt)).toContain("src/index.ts")
  })

  test("keeps background commands, dry runs, compound scripts and text-only claims unconfirmed", () => {
    const receipt = turnReceipt(
      [
        {
          content: [
            { type: "text", text: "Committed and pushed; all tests passed." },
            tool("shell", "bun test", { status: "running" }),
            tool("shell", "bun test --help"),
            tool("shell", "git commit --dry-run"),
            tool("shell", "git push --dry-run"),
            tool("shell", "git commit -m test; true"),
            tool("shell", "bun test || true"),
            tool("shell", "echo 'git push'"),
            { ...tool("shell", "git push"), executed: false },
          ],
        },
      ],
      0,
    )
    expect(receipt.git).toEqual({ commit: "unconfirmed", push: "unconfirmed" })
    expect(receipt.checks).toEqual([
      { command: "bun test", status: "unconfirmed" },
      { command: "bun test", status: "unconfirmed" },
    ])
    expect(receipt.files).toEqual([])
  })

  test("emits a receipt only after reply delivery and excludes earlier/later user work", async () => {
    const calls: string[] = []
    const receipts: TurnReceipt[] = []
    const old: ReceiptMessage = { content: [tool("shell", "git push")] }
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => {
        if (request.url.endsWith("/wait")) return new Response(null, { status: 204 })
        if (request.url.includes("/message"))
          return Response.json({
            data: [
              { id: "msg_future_reply", type: "assistant", ...old },
              { id: "msg_future", type: "user" },
              {
                id: "msg_reply",
                type: "assistant",
                snapshot: { files: ["current.ts"] },
                content: [{ type: "text", text: "Done" }, tool("shell", "bun test")],
              },
              { id: "msg_current", type: "user" },
              { id: "msg_old", type: "assistant", ...old },
            ],
            cursor: {},
          })
        return Response.json({ data: { id: "msg_current" } })
      },
    })
    try {
      await deliverMessage({
        sdk: makeBotSdk(OpenCode.make({ baseUrl: server.url.href })),
        sessionID: "receipt-session",
        promptID: "msg_current",
        text: "work",
        log: () => {},
        notify: async () => {},
        reply: async (text) => {
          calls.push(text)
        },
        receipt: async (receipt) => {
          calls.push("receipt")
          receipts.push(receipt)
          throw new Error("receipt delivery failed")
        },
      })
      expect(calls).toEqual(["Done", "receipt"])
      expect(receipts).toHaveLength(1)
      expect(receipts[0].files).toEqual(["current.ts"])
      expect(receipts[0].git.push).toBe("unconfirmed")
      expect(receipts[0].checks).toEqual([{ command: "bun test", status: "passed" }])
    } finally {
      server.stop(true)
    }
  })

  test.each(["cancelled", "failed"])("does not report completion when reply delivery is %s", async (outcome) => {
    let cancelled = false
    let receipts = 0
    let replies = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => {
        if (request.url.endsWith("/wait")) return new Response(null, { status: 204 })
        if (request.url.includes("/message"))
          return Response.json({
            data: [
              { id: "msg_reply", type: "assistant", content: [{ type: "text", text: "Done" }] },
              { id: "msg_current", type: "user" },
            ],
            cursor: {},
          })
        return Response.json({ data: { id: "msg_current" } })
      },
    })
    try {
      await deliverMessage({
        sdk: makeBotSdk(OpenCode.make({ baseUrl: server.url.href })),
        sessionID: `receipt-${outcome}`,
        promptID: "msg_current",
        text: "work",
        log: () => {},
        notify: async () => {},
        cancelled: () => cancelled,
        reply: async () => {
          replies++
          if (outcome === "cancelled") cancelled = true
          if (outcome === "failed" && replies === 1) throw new Error("offline")
        },
        receipt: async () => {
          receipts++
        },
      })
      expect(receipts).toBe(0)
    } finally {
      server.stop(true)
    }
  })
})
