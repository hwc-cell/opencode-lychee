import { expect, test } from "bun:test"
import { copyCommand, sanitizeClipboardText } from "../src/clipboard"

test("prefers Wayland clipboard when available", () => {
  expect(copyCommand("linux", true, (name) => name === "wl-copy")).toEqual(["wl-copy"])
})

test("uses pbcopy on macOS", () => {
  expect(copyCommand("darwin", false, (name) => name === "pbcopy")).toEqual(["pbcopy"])
})

test("falls back through X11 clipboard commands", () => {
  expect(copyCommand("linux", true, (name) => name === "xclip")).toEqual(["xclip", "-selection", "clipboard"])
  expect(copyCommand("linux", false, (name) => name === "xsel")).toEqual(["xsel", "--clipboard", "--input"])
})

test("returns undefined when native clipboard is unavailable", () => {
  expect(copyCommand("linux", false, () => false)).toBeUndefined()
})

test("removes NUL bytes before writing text", () => {
  expect(sanitizeClipboardText("before\0after")).toBe("beforeafter")
})
