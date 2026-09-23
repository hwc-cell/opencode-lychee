import { describe, expect, test } from "bun:test"
import { DEFAULT_THEMES } from "./default-themes"
import { resolveTheme } from "./resolve"

describe("Lychee themes", () => {
  test("registers Clear Sky and Soda independently", () => {
    const clearSky = DEFAULT_THEMES["lychee-clear-sky"]
    const soda = DEFAULT_THEMES["lychee-soda"]

    expect(clearSky?.id).toBe("lychee-clear-sky")
    expect(clearSky?.name).toBe("Lychee Clear Sky")
    expect(soda?.id).toBe("lychee-soda")
    expect(soda?.name).toBe("Lychee Soda")
    expect(clearSky).not.toBe(soda)
  })

  test("registers the seasonal Lychee themes", () => {
    expect(DEFAULT_THEMES["lychee-celadon"]?.name).toBe("Lychee Celadon")
    expect(DEFAULT_THEMES["lychee-china-red"]?.name).toBe("Lychee China Red")
    expect(DEFAULT_THEMES["lychee-osmanthus-moon"]?.name).toBe("Lychee Osmanthus Moon")

    expect(resolveTheme(DEFAULT_THEMES["lychee-celadon"]!).light["background-base"]).toBe("#F5FAF8")
    expect(resolveTheme(DEFAULT_THEMES["lychee-china-red"]!).light["background-base"]).toBe("#FFF8F3")
    expect(resolveTheme(DEFAULT_THEMES["lychee-osmanthus-moon"]!).dark["background-base"]).toBe("#111827")
  })

  test("keeps the Clear Sky light surface nearly white", () => {
    const theme = resolveTheme(DEFAULT_THEMES["lychee-clear-sky"]!)

    expect(theme.light["background-base"]).toBe("#FBFDFF")
    expect(theme.light["surface-raised-strong"]).toBe("#F4F9FF")
  })

  test("resolves both color schemes for Soda", () => {
    const theme = resolveTheme(DEFAULT_THEMES["lychee-soda"]!)

    expect(theme.light["background-base"]).toBe("#F3FBFF")
    expect(theme.dark["background-base"]).toBe("#0C1B20")
  })
})
