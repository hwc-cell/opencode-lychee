import { lycheeIcon } from "../logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"

function wordmark(pad = "") {
  const palette = new Map(Object.entries(lycheeIcon.palette))
  return [
    ...lycheeIcon.top.map(
      (line, index) =>
        pad +
        [...line]
          .map((pixel, column) => {
            const top = palette.get(pixel)
            const bottom = palette.get(lycheeIcon.bottom[index][column])
            const color = top ?? bottom
            if (!color) return " "
            const background = top && bottom ? `\x1b[48;2;${bottom.join(";")}m` : ""
            return `\x1b[38;2;${color.join(";")}m${background}${top ? "▀" : "▄"}${reset}`
          })
          .join(""),
    ),
    `${pad}${"lychee".padStart(19).padEnd(32)}`,
  ]
}

export function sessionEpilogue(input: { title: string; sessionID?: string }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...wordmark("  "),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Continue")}${bold}opencode -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}
