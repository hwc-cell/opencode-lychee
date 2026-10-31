import { describe, expect, test } from "bun:test"
import lycheeCeladonTheme from "./themes/lychee-celadon.json"
import lycheeChinaRedTheme from "./themes/lychee-china-red.json"
import lycheeClearSkyTheme from "./themes/lychee-clear-sky.json"
import lycheeOsmanthusMoonTheme from "./themes/lychee-osmanthus-moon.json"
import lycheeSodaTheme from "./themes/lychee-soda.json"
import { resolveThemeVariant } from "./resolve"
import type { DesktopTheme } from "./types"

const DEFAULT_THEMES = {
  "lychee-celadon": lycheeCeladonTheme as DesktopTheme,
  "lychee-china-red": lycheeChinaRedTheme as DesktopTheme,
  "lychee-clear-sky": lycheeClearSkyTheme as DesktopTheme,
  "lychee-osmanthus-moon": lycheeOsmanthusMoonTheme as DesktopTheme,
  "lychee-soda": lycheeSodaTheme as DesktopTheme,
}

describe("Lychee themes", () => {
  test("names all five desktop palettes", () => {
    expect(DEFAULT_THEMES["lychee-celadon"]?.name).toBe("Lychee Celadon")
    expect(DEFAULT_THEMES["lychee-china-red"]?.name).toBe("Lychee China Red")
    expect(DEFAULT_THEMES["lychee-clear-sky"]?.name).toBe("Lychee Clear Sky")
    expect(DEFAULT_THEMES["lychee-osmanthus-moon"]?.name).toBe("Lychee Osmanthus Moon")
    expect(DEFAULT_THEMES["lychee-soda"]?.name).toBe("Lychee Soda")
  })

  test("keeps light and dark palette anchors", () => {
    expect(resolveThemeVariant(DEFAULT_THEMES["lychee-clear-sky"].light, false)["background-base"]).toBe("#FBFDFF")
    expect(resolveThemeVariant(DEFAULT_THEMES["lychee-soda"].dark, true)["background-base"]).toBe("#0C1B20")
    expect(resolveThemeVariant(DEFAULT_THEMES["lychee-celadon"].light, false)["background-base"]).toBe("#F5FAF8")
    expect(resolveThemeVariant(DEFAULT_THEMES["lychee-china-red"].light, false)["background-base"]).toBe("#FFF8F3")
    expect(resolveThemeVariant(DEFAULT_THEMES["lychee-osmanthus-moon"].dark, true)["background-base"]).toBe("#111827")
  })
})
