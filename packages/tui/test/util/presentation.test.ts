import { expect, test } from "bun:test"
import { sessionEpilogue } from "../../src/util/presentation"

test("formats session continuation summary", () => {
  const epilogue = sessionEpilogue({ title: "A session", sessionID: "ses_123" })
  expect(epilogue).toContain("A session")
  expect(epilogue).toContain("opencode -s ses_123")
  const lines = Bun.stripANSI(epilogue).split("\n")
  expect(lines[0]).toBe(`  ${" ".repeat(18)}▄▀▀${" ".repeat(11)}`)
  expect(lines[9].trim()).toBe("lychee")
  expect(epilogue).toContain("\x1b[38;2;126;176;60m")
  expect(epilogue).toContain("\x1b[38;2;232;76;70m")
  expect(epilogue).toContain("\x1b[48;2;198;52;46m")
})
