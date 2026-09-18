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
