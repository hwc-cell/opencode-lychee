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

export type SessionEpilogue = { readonly title: string; readonly sessionID?: string }

// Printed after the TUI closes.
export function epilogue(input: { readonly session?: SessionEpilogue; readonly updatedVersion?: string }) {
  if (!input.session && !input.updatedVersion) return
  const row = (label: string, value: string) => `  ${dim}${label.padEnd(10, " ")}${reset}${bold}${value}${reset}`
  return [
    ...wordmark("  "),
    "",
    ...(input.updatedVersion
      ? [`  ${dim}Run ${reset}${bold}opencode${reset}${dim} to use ${reset}${bold}${input.updatedVersion}${reset}`, ""]
      : []),
    ...(input.session
      ? [row("Session", input.session.title), row("Continue", `opencode -s ${input.session.sessionID}`), ""]
      : []),
  ].join("\n")
}
