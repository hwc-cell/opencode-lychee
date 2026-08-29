import { icon } from "../logo"
import { t } from "../i18n"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"

function iconArt(pad = "") {
  const pal = icon.palette as Record<string, [number, number, number]>
  const lines: string[] = []
  for (let i = 0; i < icon.top.length; i++) {
    const topRow = icon.top[i]
    const bottomRow = icon.bottom[i]
    let line = pad
    for (let x = 0; x < topRow.length; x++) {
      const top = pal[topRow[x]]
      const bottom = pal[bottomRow[x]]
      if (top && bottom) {
        line += `\x1b[38;2;${top[0]};${top[1]};${top[2]}m\x1b[48;2;${bottom[0]};${bottom[1]};${bottom[2]}m▀${reset}`
      } else if (top) {
        line += `\x1b[38;2;${top[0]};${top[1]};${top[2]}m▀${reset}`
      } else if (bottom) {
        line += `\x1b[38;2;169;169;169m\x1b[48;2;${bottom[0]};${bottom[1]};${bottom[2]}m▀${reset}`
      } else {
        line += " "
      }
    }
    lines.push(line)
  }
  return lines
}

export function sessionEpilogue(input: { title: string; sessionID?: string }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...iconArt("  "),
    "",
    `  ${weak(t("epilogue.session"))}${bold}${input.title}${reset}`,
    `  ${weak(t("epilogue.continue"))}${bold}opencode -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}
