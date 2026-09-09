import { describe, expect, test } from "bun:test"
import { buildSessionRecord, ledgerClientID, localDate } from "../../src/util/ledger"

describe("lychee ledger", () => {
  test("uses a stable client id for each session", () => {
    expect(ledgerClientID("session-one")).toBe(ledgerClientID("session-one"))
    expect(ledgerClientID("session-one")).not.toBe(ledgerClientID("session-two"))
    expect(Number.isSafeInteger(ledgerClientID("session-one"))).toBe(true)
  })

  test("reuses the session client id when the cumulative cost changes", () => {
    const first = buildSessionRecord({ sessionID: "session-one", title: "First", costUSD: 1 })
    const updated = buildSessionRecord({ sessionID: "session-one", title: "First", costUSD: 2 })
    expect(first?.client_id).toBe(updated?.client_id)
    expect(first?.amount).toBe(-7.25)
    expect(updated?.amount).toBe(-14.5)
  })

  test("formats dates in local time", () => {
    const date = new Date(2026, 0, 2, 1, 30)
    expect(localDate(date)).toBe("2026-01-02")
  })
})
