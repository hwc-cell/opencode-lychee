import { describe, expect, test } from "bun:test"
import { DEFAULT_THEMES } from "./default-themes"
import { resolveTheme } from "./resolve"

describe("Lychee themes", () => {
  test("registers all five desktop palettes", () => {
    expect(DEFAULT_THEMES["lychee-celadon"]?.name).toBe("Lychee Celadon")
    expect(DEFAULT_THEMES["lychee-china-red"]?.name).toBe("Lychee China Red")
    expect(DEFAULT_THEMES["lychee-clear-sky"]?.name).toBe("Lychee Clear Sky")
    expect(DEFAULT_THEMES["lychee-osmanthus-moon"]?.name).toBe("Lychee Osmanthus Moon")
    expect(DEFAULT_THEMES["lychee-soda"]?.name).toBe("Lychee Soda")
  })

  test("keeps light and dark palette anchors", () => {
    expect(resolveTheme(DEFAULT_THEMES["lychee-clear-sky"]!).light["background-base"]).toBe("#FBFDFF")
    expect(resolveTheme(DEFAULT_THEMES["lychee-soda"]!).dark["background-base"]).toBe("#0C1B20")
    expect(resolveTheme(DEFAULT_THEMES["lychee-celadon"]!).light["background-base"]).toBe("#F5FAF8")
    expect(resolveTheme(DEFAULT_THEMES["lychee-china-red"]!).light["background-base"]).toBe("#FFF8F3")
    expect(resolveTheme(DEFAULT_THEMES["lychee-osmanthus-moon"]!).dark["background-base"]).toBe("#111827")
  })
})
