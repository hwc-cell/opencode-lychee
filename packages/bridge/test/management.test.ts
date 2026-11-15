import { describe, expect, test } from "bun:test"
import { handleChatCommand } from "../src/commands"
import { cancelQueuedTask, enqueue, queuedTasks } from "../src/bot"
import { discardQueuedMessages, queuedMessageID } from "../src/weixin/inbox"
import { conversationKey, messageKey } from "../src/weixin/keys"
import type { WeixinState } from "../src/weixin/state"

function fixture() {
  const replies: string[] = []
  return {
    replies,
    args: {
      channel: "weixin",
      fromUserId: "owner",
      ownerUserId: "owner",
      workDir: "/one",
      log: () => {},
      reply: async (text: string) => {
        replies.push(text)
      },
    },
  }
}

describe("chat management commands", () => {
  test("lists and cancels one queued task in this chat", async () => {
    const gate = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const calls: string[] = []
    const active = enqueue(
      "management-chat",
      async () => {
        started.resolve()
        await gate.promise
      },
      { id: "active", text: "正在处理" },
    )
    await started.promise
    const waiting = enqueue(
      "management-chat",
      async () => {
        calls.push("cancelled")
      },
      { id: "waiting", text: "待处理" },
    )
    const kept = enqueue(
      "management-chat",
      async () => {
        calls.push("kept")
      },
      { id: "kept", text: "保留" },
    )
    const { args, replies } = fixture()
    const queue = {
      list: () => queuedTasks("management-chat"),
      cancel: (id: string) => cancelQueuedTask("management-chat", id),
    }
    try {
      expect(await handleChatCommand({ ...args, queue, text: "/queue" })).toBe(true)
      expect(replies.at(-1)).toContain("▶ active 正在处理")
      expect(await handleChatCommand({ ...args, queue, text: "/queue cancel waiting" })).toBe(true)
      expect(queuedTasks("management-chat").map((task) => task.id)).toEqual(["active", "kept"])
      expect(await handleChatCommand({ ...args, queue, text: "/queue cancel active" })).toBe(true)
      expect(replies.at(-1)).toContain("/stop")
    } finally {
      gate.resolve()
      await Promise.all([active, waiting, kept])
    }
    expect(calls).toEqual(["kept"])
  })

  test("project switching validates the selected project and owner", async () => {
    const { args, replies } = fixture()
    const directories: string[] = []
    const controls = {
      newSession: async () => true,
      clearSession: async () => true,
      stop: async () => false,
      status: async () => ({ directory: "/one", running: false }),
      projects: async () => [
        { directory: "/one", active: true },
        { directory: "/two", active: false },
      ],
      directory: async (next?: string) => {
        if (next) directories.push(next)
        return { ok: true, directory: next ?? "/one", changed: Boolean(next) }
      },
    }
    await handleChatCommand({ ...args, controls, text: "/projects" })
    expect(replies.at(-1)).toContain("2. /two")
    await handleChatCommand({ ...args, controls, text: "/projects 2", fromUserId: "other" })
    await handleChatCommand({ ...args, controls, text: "/projects 99" })
    await handleChatCommand({ ...args, controls, text: "/projects NaN" })
    expect(directories).toEqual([])
    await handleChatCommand({ ...args, controls, text: "/projects 2" })
    expect(directories).toEqual(["/two"])
  })

  test("only passes locally listed session IDs to the switcher", async () => {
    const { args, replies } = fixture()
    const selected: string[] = []
    const controls = {
      newSession: async () => true,
      clearSession: async () => true,
      stop: async () => false,
      status: async () => ({ directory: "/one", running: false }),
      directory: async () => ({ ok: true, directory: "/one" }),
      sessions: async () => [{ id: "ses_local", active: true }],
      switchSession: async (id: string) => {
        selected.push(id)
        return true
      },
    }
    await handleChatCommand({ ...args, controls, text: "/sessions" })
    expect(replies.at(-1)).toContain("ses_local")
    await handleChatCommand({ ...args, controls, text: "/sessions ses_foreign" })
    expect(selected).toEqual([])
    await handleChatCommand({ ...args, controls, text: "/sessions ses_local" })
    expect(selected).toEqual(["ses_local"])
  })

  test("cancellation removes only its own chat's durable message", () => {
    const first = { from_user_id: "owner", message_id: 1 }
    const other = { ...first, group_id: "other-group" }
    const kept = { ...first, message_id: 2 }
    const state: WeixinState = {
      inbox: {
        [messageKey("bot", first)]: first,
        [messageKey("bot", other)]: other,
        [messageKey("bot", kept)]: kept,
      },
    }
    expect(queuedMessageID("bot", first)).toBe(queuedMessageID("bot", first))
    discardQueuedMessages(state, "bot", conversationKey("bot", first), [queuedMessageID("bot", first)])
    expect(state.inbox?.[messageKey("bot", first)]).toBeUndefined()
    expect(state.inbox?.[messageKey("bot", other)]).toEqual(other)
    expect(state.inbox?.[messageKey("bot", kept)]).toEqual(kept)
  })
})
