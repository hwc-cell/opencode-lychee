import type { DesktopTheme } from "./types"
import oc2ThemeJson from "./themes/oc-2.json"
import amoledThemeJson from "./themes/amoled.json"
import auraThemeJson from "./themes/aura.json"
import ayuThemeJson from "./themes/ayu.json"
import carbonfoxThemeJson from "./themes/carbonfox.json"
import catppuccinThemeJson from "./themes/catppuccin.json"
import catppuccinFrappeThemeJson from "./themes/catppuccin-frappe.json"
import catppuccinMacchiatoThemeJson from "./themes/catppuccin-macchiato.json"
import cobalt2ThemeJson from "./themes/cobalt2.json"
import cursorThemeJson from "./themes/cursor.json"
import draculaThemeJson from "./themes/dracula.json"
import everforestThemeJson from "./themes/everforest.json"
import flexokiThemeJson from "./themes/flexoki.json"
import githubThemeJson from "./themes/github.json"
import gruvboxThemeJson from "./themes/gruvbox.json"
import kanagawaThemeJson from "./themes/kanagawa.json"
import lycheeCeladonThemeJson from "./themes/lychee-celadon.json"
import lycheeChinaRedThemeJson from "./themes/lychee-china-red.json"
import lycheeClearSkyThemeJson from "./themes/lychee-clear-sky.json"
import lycheeOsmanthusMoonThemeJson from "./themes/lychee-osmanthus-moon.json"
import lycheeSodaThemeJson from "./themes/lychee-soda.json"
import lucentOrngThemeJson from "./themes/lucent-orng.json"
import materialThemeJson from "./themes/material.json"
import matrixThemeJson from "./themes/matrix.json"
import mercuryThemeJson from "./themes/mercury.json"
import monokaiThemeJson from "./themes/monokai.json"
import nightowlThemeJson from "./themes/nightowl.json"
import nordThemeJson from "./themes/nord.json"
import oneDarkThemeJson from "./themes/one-dark.json"
import oneDarkProThemeJson from "./themes/onedarkpro.json"
import orngThemeJson from "./themes/orng.json"
import osakaJadeThemeJson from "./themes/osaka-jade.json"
import palenightThemeJson from "./themes/palenight.json"
import rosepineThemeJson from "./themes/rosepine.json"
import shadesOfPurpleThemeJson from "./themes/shadesofpurple.json"
import solarizedThemeJson from "./themes/solarized.json"
import synthwave84ThemeJson from "./themes/synthwave84.json"
import tokyonightThemeJson from "./themes/tokyonight.json"
import vercelThemeJson from "./themes/vercel.json"
import vesperThemeJson from "./themes/vesper.json"
import zenburnThemeJson from "./themes/zenburn.json"

type DesktopThemeJson = Pick<DesktopTheme, "$schema" | "id" | "name"> & { light: object; dark: object }

function theme(value: DesktopThemeJson) {
  // SAFETY: Bundled theme JSON is exercised through resolveTheme in the theme test suite.
  return value as DesktopTheme
}

export const oc2Theme = theme(oc2ThemeJson)

export const amoledTheme = theme(amoledThemeJson)

export const auraTheme = theme(auraThemeJson)

export const ayuTheme = theme(ayuThemeJson)

export const carbonfoxTheme = theme(carbonfoxThemeJson)

export const catppuccinTheme = theme(catppuccinThemeJson)

export const catppuccinFrappeTheme = theme(catppuccinFrappeThemeJson)

export const catppuccinMacchiatoTheme = theme(catppuccinMacchiatoThemeJson)

export const cobalt2Theme = theme(cobalt2ThemeJson)

export const cursorTheme = theme(cursorThemeJson)

export const draculaTheme = theme(draculaThemeJson)

export const everforestTheme = theme(everforestThemeJson)

export const flexokiTheme = theme(flexokiThemeJson)

export const githubTheme = theme(githubThemeJson)

export const gruvboxTheme = theme(gruvboxThemeJson)

export const kanagawaTheme = theme(kanagawaThemeJson)

export const lycheeCeladonTheme = theme(lycheeCeladonThemeJson)

export const lycheeChinaRedTheme = theme(lycheeChinaRedThemeJson)

export const lycheeClearSkyTheme = theme(lycheeClearSkyThemeJson)

export const lycheeOsmanthusMoonTheme = theme(lycheeOsmanthusMoonThemeJson)

export const lycheeSodaTheme = theme(lycheeSodaThemeJson)

export const lucentOrngTheme = theme(lucentOrngThemeJson)

export const materialTheme = theme(materialThemeJson)

export const matrixTheme = theme(matrixThemeJson)

export const mercuryTheme = theme(mercuryThemeJson)

export const monokaiTheme = theme(monokaiThemeJson)

export const nightowlTheme = theme(nightowlThemeJson)

export const nordTheme = theme(nordThemeJson)

export const oneDarkTheme = theme(oneDarkThemeJson)

export const oneDarkProTheme = theme(oneDarkProThemeJson)

export const orngTheme = theme(orngThemeJson)

export const osakaJadeTheme = theme(osakaJadeThemeJson)

export const palenightTheme = theme(palenightThemeJson)

export const rosepineTheme = theme(rosepineThemeJson)

export const shadesOfPurpleTheme = theme(shadesOfPurpleThemeJson)

export const solarizedTheme = theme(solarizedThemeJson)

export const synthwave84Theme = theme(synthwave84ThemeJson)

export const tokyonightTheme = theme(tokyonightThemeJson)

export const vercelTheme = theme(vercelThemeJson)

export const vesperTheme = theme(vesperThemeJson)

export const zenburnTheme = theme(zenburnThemeJson)

export const DEFAULT_THEMES = {
  "oc-2": oc2Theme,
  amoled: amoledTheme,
  aura: auraTheme,
  ayu: ayuTheme,
  carbonfox: carbonfoxTheme,
  catppuccin: catppuccinTheme,
  "catppuccin-frappe": catppuccinFrappeTheme,
  "catppuccin-macchiato": catppuccinMacchiatoTheme,
  cobalt2: cobalt2Theme,
  cursor: cursorTheme,
  dracula: draculaTheme,
  everforest: everforestTheme,
  flexoki: flexokiTheme,
  github: githubTheme,
  gruvbox: gruvboxTheme,
  kanagawa: kanagawaTheme,
  "lychee-celadon": lycheeCeladonTheme,
  "lychee-china-red": lycheeChinaRedTheme,
  "lychee-clear-sky": lycheeClearSkyTheme,
  "lychee-osmanthus-moon": lycheeOsmanthusMoonTheme,
  "lychee-soda": lycheeSodaTheme,
  "lucent-orng": lucentOrngTheme,
  material: materialTheme,
  matrix: matrixTheme,
  mercury: mercuryTheme,
  monokai: monokaiTheme,
  nightowl: nightowlTheme,
  nord: nordTheme,
  "one-dark": oneDarkTheme,
  onedarkpro: oneDarkProTheme,
  orng: orngTheme,
  "osaka-jade": osakaJadeTheme,
  palenight: palenightTheme,
  rosepine: rosepineTheme,
  shadesofpurple: shadesOfPurpleTheme,
  solarized: solarizedTheme,
  synthwave84: synthwave84Theme,
  tokyonight: tokyonightTheme,
  vercel: vercelTheme,
  vesper: vesperTheme,
  zenburn: zenburnTheme,
} satisfies Record<string, DesktopTheme>
