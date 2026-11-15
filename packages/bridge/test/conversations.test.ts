import { describe, expect, test } from "bun:test"
import {
  clearCurrentSession,
  currentDirectory,
  listProjects,
  listSessions,
  rememberSession,
  switchProject,
  switchSession,
} from "../src/weixin/conversations"
import type { WeixinState } from "../src/weixin/state"

describe("chat project bindings", () => {
  test("adopts legacy settings without changing the global fallback or other chats", () => {
    const state: WeixinState = { workDir: "/old", sessions: { alice: "old-a", bob: "old-b" } }
    expect(currentDirectory(state, "alice", "/default")).toBe("/old")
    expect(listSessions(state, "alice", "/default")).toEqual([{ id: "old-a", current: true }])
    expect(state.conversations).toBeUndefined()
    expect(switchProject(state, "alice", "/default", "/new")).toEqual({
      changed: true,
      previousSessionID: "old-a",
      sessionID: undefined,
    })
    expect(state.workDir).toBe("/old")
    expect(state.sessions).toEqual({ bob: "old-b" })
    expect(currentDirectory(state, "alice", "/default")).toBe("/new")
    expect(currentDirectory(state, "bob", "/default")).toBe("/old")
    expect(listSessions(state, "bob", "/default")).toEqual([{ id: "old-b", current: true }])
  })

  test("restores each project's current session after switching back", () => {
    const state: WeixinState = {}
    rememberSession(state, "chat", "/one", "session-one")
    switchProject(state, "chat", "/one", "/two")
    rememberSession(state, "chat", "/one", "session-two")
    expect(state.sessions?.chat).toBe("session-two")
    expect(switchProject(state, "chat", "/one", "/one")).toEqual({
      changed: true,
      previousSessionID: "session-two",
      sessionID: "session-one",
    })
    expect(state.sessions?.chat).toBe("session-one")
    expect(listProjects(state, "chat", "/one")).toEqual([
      { directory: "/one", active: true, sessionID: "session-one" },
      { directory: "/two", active: false, sessionID: "session-two" },
    ])
    expect(listSessions(state, "chat", "/one")).toEqual([{ id: "session-one", current: true }])
  })

  test("new and clear preserve history while removing only the current mapping", () => {
    const state: WeixinState = { sessions: { chat: "first", other: "other-session" } }
    expect(clearCurrentSession(state, "chat", "/one")).toBe("first")
    expect(clearCurrentSession(state, "chat", "/one")).toBeUndefined()
    expect(listSessions(state, "chat", "/one")).toEqual([{ id: "first", current: false }])
    rememberSession(state, "chat", "/one", "second")
    rememberSession(state, "chat", "/one", "second")
    expect(listSessions(state, "chat", "/one")).toEqual([
      { id: "second", current: true },
      { id: "first", current: false },
    ])
    expect(switchSession(state, "chat", "/one", "first")).toEqual({
      ok: true,
      changed: true,
      previousSessionID: "second",
      sessionID: "first",
    })
    expect(state.sessions).toEqual({ chat: "first", other: "other-session" })
    expect(switchSession(state, "chat", "/one", "first").changed).toBe(false)
  })

  test("rejects sessions from other chats, other projects and arbitrary server IDs", () => {
    const state: WeixinState = {}
    rememberSession(state, "alice", "/one", "alice-one")
    rememberSession(state, "bob", "/one", "bob-one")
    switchProject(state, "alice", "/one", "/two")
    rememberSession(state, "alice", "/one", "alice-two")
    const before = structuredClone(state)
    for (const id of ["bob-one", "alice-one", "arbitrary-session"])
      expect(switchSession(state, "alice", "/one", id).ok).toBe(false)
    expect(state).toEqual(before)
    expect(listSessions(state, "alice", "/one")).toEqual([{ id: "alice-two", current: true }])
  })

  test("preserves unrelated credential, routing, model and health fields", () => {
    const state: WeixinState = {
      cursor: "cursor",
      contexts: { chat: "context" },
      models: { chat: { id: "m", providerID: "p" } },
      busyModes: { chat: "queue" },
      health: { status: "online", updatedAt: "now" },
      credential: {
        token: "fixture",
        baseUrl: "https://example.com",
        accountId: "fixture",
        userId: "fixture",
        savedAt: "now",
      },
    }
    const before = structuredClone(state)
    rememberSession(state, "chat", "/one", "first")
    switchProject(state, "chat", "/one", "/two")
    const { sessions, conversations, ...unrelated } = state
    expect(unrelated).toEqual(before)
    expect(sessions).toEqual({})
    expect(conversations?.chat.directory).toBe("/two")
  })
})
