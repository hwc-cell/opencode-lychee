import { expect, test } from "bun:test"
import { epilogue } from "../../src/util/presentation"

const rows = (text: string | undefined) =>
  Bun.stripANSI(text ?? "")
    .split("\n")
    .filter((line) => line.trim() && line.trim() !== "lychee" && !/[▀▄█]/.test(line))

test("prints nothing without a session or update", () => {
  expect(epilogue({})).toBeUndefined()
})

test("formats session continuation summary", () => {
  const output = epilogue({ session: { title: "A session", sessionID: "ses_123" } })
  const lines = Bun.stripANSI(output ?? "").split("\n")
  expect(lines[0]).toBe(`  ${" ".repeat(18)}▄▀▀${" ".repeat(11)}`)
  expect(lines[9].trim()).toBe("lychee")
  expect(output).toContain("\x1b[38;2;126;176;60m")
  expect(output).toContain("\x1b[38;2;232;76;70m")
  expect(output).toContain("\x1b[48;2;198;52;46m")
  expect(rows(output)).toEqual(["  Session   A session", "  Continue  opencode -s ses_123"])
})

test("tells the user to start OpenCode again after an update", () => {
  expect(rows(epilogue({ updatedVersion: "2.0.0" }))).toEqual(["  Run opencode to use 2.0.0"])
})

test("keeps the session continuation after an update", () => {
  expect(rows(epilogue({ session: { title: "A session", sessionID: "ses_123" }, updatedVersion: "2.0.0" }))).toEqual([
    "  Run opencode to use 2.0.0",
    "  Session   A session",
    "  Continue  opencode -s ses_123",
  ])
})
