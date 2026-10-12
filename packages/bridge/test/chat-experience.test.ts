import { describe, expect, test } from "bun:test"
import { OpenCode } from "@opencode/client"
import { cancelQueued, deliverMessage, enqueue, isQueued, isSessionRunning, readTurnResponse } from "../src/bot"
import { handleChatCommand } from "../src/commands"
import { handlePermissionCommand, notifyPermissions } from "../src/permissions"
import { makeBotSdk } from "../src/weixin/bridge"

function assistant(id: string, text: string) {
  return { id, type: "assistant", content: [{ type: "text", text }] }
}

function fixtureServer(handle: (request: Request) => Response | Promise<Response>) {
  return Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handle })
}

describe("reply boundaries", () => {
  test("does not replay the previous response before the new input is delivered", async () => {
    const server = fixtureServer(() => Response.json({ data: [assistant("msg_old", "old response")], cursor: {} }))
    try {
      const sdk = makeBotSdk(OpenCode.make({ baseUrl: server.url.href }))
      expect(await readTurnResponse(sdk.v2.session, "session", "msg_current")).toEqual({ text: "" })
    } finally {
      server.stop(true)
    }
  })

  test("collects separate model steps and excludes previous turns", async () => {
    const server = fixtureServer(() =>
      Response.json({
        data: [
          assistant("msg_final", "Done"),
          assistant("msg_step", "Let me check"),
          { id: "msg_current", type: "user" },
          assistant("msg_old", "Old"),
        ],
        cursor: {},
      }),
    )
    try {
      const sdk = makeBotSdk(OpenCode.make({ baseUrl: server.url.href }))
      expect((await readTurnResponse(sdk.v2.session, "session", "msg_current")).text).toBe("Let me check\n\nDone")
    } finally {
      server.stop(true)
    }
  })

  test("preserves cursors and omits order on paginated requests", async () => {
    const queries: URL[] = []
    const server = fixtureServer((request) => {
      const url = new URL(request.url)
      queries.push(url)
      if (url.searchParams.has("cursor"))
        return Response.json({
          data: [assistant("msg_first", "First"), { id: "msg_current", type: "user" }],
          cursor: {},
        })
      return Response.json({ data: [assistant("msg_last", "Last")], cursor: { next: "next-page" } })
    })
    try {
      const sdk = makeBotSdk(OpenCode.make({ baseUrl: server.url.href }))
      expect((await readTurnResponse(sdk.v2.session, "session", "msg_current")).text).toBe("First\n\nLast")
      expect(queries[0].searchParams.get("order")).toBe("desc")
      expect(queries[1].searchParams.get("cursor")).toBe("next-page")
      expect(queries[1].searchParams.has("order")).toBe(false)
    } finally {
      server.stop(true)
    }
  })

  test("does not include a later user's reply when an old input is retried", async () => {
    const server = fixtureServer(() =>
      Response.json({
        data: [
          assistant("msg_future_reply", "Future"),
          { id: "msg_future", type: "user" },
          assistant("msg_reply", "Current"),
          { id: "msg_current", type: "user" },
        ],
        cursor: {},
      }),
    )
    try {
      const sdk = makeBotSdk(OpenCode.make({ baseUrl: server.url.href }))
      expect((await readTurnResponse(sdk.v2.session, "session", "msg_current")).text).toBe("Current")
    } finally {
      server.stop(true)
    }
  })

  test("sends the complete short final step after a longer streamed step", async () => {
    let finish = () => {}
    const waiting = new Promise<void>((resolve) => {
      finish = resolve
    })
    let completed = false
    const first = "A".repeat(100)
    const server = fixtureServer(async (request) => {
      if (request.url.endsWith("/wait")) {
        await waiting
        return new Response(null, { status: 204 })
      }
      if (request.url.includes("/message"))
        return Response.json({
          data: [
            ...(completed ? [assistant("msg_final", "Done")] : []),
            assistant("msg_step", first),
            { id: "msg_current", type: "user" },
          ],
          cursor: {},
        })
      return Response.json({ data: { id: "msg_current" } })
    })
    const replies: string[] = []
    try {
      await deliverMessage({
        sdk: makeBotSdk(OpenCode.make({ baseUrl: server.url.href })),
        sessionID: "stream-session",
        text: "work",
        promptID: "msg_current",
        log: () => {},
        notify: async () => {},
        reply: async (text) => {
          replies.push(text)
          completed = true
          finish()
        },
      })
      expect(replies.join("")).toBe(first + "\n\nDone")
      expect(isSessionRunning("stream-session")).toBe(false)
    } finally {
      finish()
      server.stop(true)
    }
  })

  test("a failed start notification releases the running state", async () => {
    const server = fixtureServer(() => Response.json({ data: { id: "msg_current" } }))
    try {
      await deliverMessage({
        sdk: makeBotSdk(OpenCode.make({ baseUrl: server.url.href })),
        sessionID: "failed-notice",
        text: "work",
        log: () => {},
        reply: async () => {},
        notify: async () => {
          throw new Error("offline")
        },
      })
      expect(isSessionRunning("failed-notice")).toBe(false)
    } finally {
      server.stop(true)
    }
  })

  test("a rewritten response sends an explicitly labelled final correction", async () => {
    let finish = () => {}
    const waiting = new Promise<void>((resolve) => {
      finish = resolve
    })
    let completed = false
    const first = "A".repeat(100)
    const server = fixtureServer(async (request) => {
      if (request.url.endsWith("/wait")) {
        await waiting
        return new Response(null, { status: 204 })
      }
      if (request.url.includes("/message"))
        return Response.json({
          data: [assistant("msg_reply", completed ? "Corrected" : first), { id: "msg_current", type: "user" }],
          cursor: {},
        })
      return Response.json({ data: { id: "msg_current" } })
    })
    const replies: string[] = []
    try {
      await deliverMessage({
        sdk: makeBotSdk(OpenCode.make({ baseUrl: server.url.href })),
        sessionID: "revised-session",
        text: "work",
        promptID: "msg_current",
        log: () => {},
        notify: async () => {},
        reply: async (text) => {
          replies.push(text)
          completed = true
          finish()
        },
      })
      expect(replies[0]).toBe(first)
      expect(replies[1]).toContain("完整修订版")
      expect(replies[1]).toContain("Corrected")
    } finally {
      finish()
      server.stop(true)
    }
  })
})

describe("continuous messages", () => {
  test("does not submit a task stopped while its start notification is sending", async () => {
    let calls = 0
    let cancelled = false
    const server = fixtureServer(() => {
      calls++
      return Response.json({ data: {} })
    })
    try {
      await deliverMessage({
        sdk: makeBotSdk(OpenCode.make({ baseUrl: server.url.href })),
        sessionID: "cancelled-session",
        text: "work",
        log: () => {},
        reply: async () => {},
        notify: async () => {
          cancelled = true
        },
        cancelled: () => cancelled,
      })
      expect(calls).toBe(0)
      expect(isSessionRunning("cancelled-session")).toBe(false)
    } finally {
      server.stop(true)
    }
  })
  test("cancels waiting work while preserving the current task and allowing new work", async () => {
    const calls: string[] = []
    let finish = () => {}
    let started = () => {}
    const waiting = new Promise<void>((resolve) => {
      finish = resolve
    })
    const active = new Promise<void>((resolve) => {
      started = resolve
    })
    const first = enqueue("cancel-chat", async () => {
      calls.push("first")
      started()
      await waiting
    })
    await active
    const second = enqueue("cancel-chat", async () => {
      calls.push("second")
    })
    expect(cancelQueued("cancel-chat")).toBe(true)
    const third = enqueue("cancel-chat", async () => {
      calls.push("third")
    })
    finish()
    await Promise.all([first, second, third])
    expect(calls).toEqual(["first", "third"])
    expect(isQueued("cancel-chat")).toBe(false)
  })

  test("validates and changes busy mode without sending an AI prompt", async () => {
    let mode: "queue" | "interrupt" = "queue"
    const replies: string[] = []
    const args = {
      channel: "weixin",
      fromUserId: "owner",
      ownerUserId: "owner",
      workDir: "/work",
      log: () => {},
      reply: async (text: string) => {
        replies.push(text)
      },
      busyMode: async (next?: "queue" | "interrupt") => {
        if (next) mode = next
        return mode
      },
    }
    expect(await handleChatCommand({ ...args, text: "/busy" })).toBe(true)
    expect(mode).toBe("queue")
    expect(await handleChatCommand({ ...args, text: "/busy interrupt" })).toBe(true)
    expect(mode).toBe("interrupt")
    expect(await handleChatCommand({ ...args, text: "/busy typo" })).toBe(true)
    expect(mode).toBe("interrupt")
    expect(replies.at(-1)).toContain("/busy queue")
  })
})

describe("permissions over chat", () => {
  test("announces once and approves only a live request in the current session", async () => {
    let pending = true
    const decisions: unknown[] = []
    const server = fixtureServer(async (request) => {
      if (request.url.endsWith("/reply")) {
        decisions.push(await request.json())
        pending = false
        return new Response(null, { status: 204 })
      }
      return Response.json({
        data: pending ? [{ id: "perm_1", sessionID: "session", action: "edit", resources: ["file.ts"] }] : [],
      })
    })
    const replies: string[] = []
    try {
      const client = OpenCode.make({ baseUrl: server.url.href })
      const reply = async (text: string) => {
        replies.push(text)
      }
      const announced = new Set<string>()
      await notifyPermissions({ client, sessionID: "session", announced, reply })
      await notifyPermissions({ client, sessionID: "session", announced, reply })
      expect(replies).toHaveLength(1)
      expect(replies[0]).toContain("/approve perm_1")
      await handlePermissionCommand({ client, sessionID: "session", text: "/approve perm_wrong", owner: true, reply })
      expect(decisions).toHaveLength(0)
      await handlePermissionCommand({ client, sessionID: "session", text: "/approve perm_1", owner: true, reply })
      expect(decisions).toEqual([{ decision: "once" }])
      await handlePermissionCommand({ client, sessionID: "session", text: "/approve perm_1", owner: true, reply })
      expect(decisions).toHaveLength(1)
    } finally {
      server.stop(true)
    }
  })

  test("rejects non-owner and cross-session approvals; supports deny", async () => {
    const decisions: unknown[] = []
    let calls = 0
    const server = fixtureServer(async (request) => {
      calls++
      if (request.url.endsWith("/reply")) {
        decisions.push(await request.json())
        return new Response(null, { status: 204 })
      }
      return Response.json({
        data: [
          { id: "perm_1", sessionID: "other", action: "edit", resources: [] },
          { id: "perm_2", sessionID: "session", action: "execute", resources: [] },
        ],
      })
    })
    try {
      const args = { client: OpenCode.make({ baseUrl: server.url.href }), sessionID: "session", reply: async () => {} }
      await handlePermissionCommand({ ...args, text: "/approve perm_2", owner: false })
      expect(calls).toBe(0)
      await handlePermissionCommand({ ...args, text: "/approve perm_1", owner: true })
      expect(decisions).toHaveLength(0)
      await handlePermissionCommand({ ...args, text: "/deny perm_2", owner: true })
      expect(decisions).toEqual([{ decision: "reject" }])
    } finally {
      server.stop(true)
    }
  })
})
