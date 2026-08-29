import { EOL } from "os"
import { Schema } from "effect"
import { icon } from "./logo"

export class CancelledError extends Schema.TaggedErrorClass<CancelledError>()("UICancelledError", {}) {}

export const Style = {
  TEXT_HIGHLIGHT: "\x1b[96m",
  TEXT_HIGHLIGHT_BOLD: "\x1b[96m\x1b[1m",
  TEXT_DIM: "\x1b[90m",
  TEXT_DIM_BOLD: "\x1b[90m\x1b[1m",
  TEXT_NORMAL: "\x1b[0m",
  TEXT_NORMAL_BOLD: "\x1b[1m",
  TEXT_WARNING: "\x1b[93m",
  TEXT_WARNING_BOLD: "\x1b[93m\x1b[1m",
  TEXT_DANGER: "\x1b[91m",
  TEXT_DANGER_BOLD: "\x1b[91m\x1b[1m",
  TEXT_SUCCESS: "\x1b[92m",
  TEXT_SUCCESS_BOLD: "\x1b[92m\x1b[1m",
  TEXT_INFO: "\x1b[94m",
  TEXT_INFO_BOLD: "\x1b[94m\x1b[1m",
}

export function println(...message: string[]) {
  print(...message)
  process.stderr.write(EOL)
}

export function print(...message: string[]) {
  blank = false
  process.stderr.write(message.join(" "))
}

let blank = false
export function empty() {
  if (blank) return
  println("" + Style.TEXT_NORMAL)
  blank = true
}

export function logo(pad?: string) {
  const pal = icon.palette as Record<string, [number, number, number]>
  const reset = "\x1b[0m"
  const tty = process.stdout.isTTY || process.stderr.isTTY
  const result: string[] = []
  for (let i = 0; i < icon.top.length; i++) {
    const topRow = icon.top[i]
    const bottomRow = icon.bottom[i]
    if (pad) result.push(pad)
    for (let x = 0; x < topRow.length; x++) {
      const top = pal[topRow[x]]
      const bottom = pal[bottomRow[x]]
      if (tty) {
        if (top && bottom) {
          result.push(
            `\x1b[38;2;${top[0]};${top[1]};${top[2]}m\x1b[48;2;${bottom[0]};${bottom[1]};${bottom[2]}m▀${reset}`,
          )
        } else if (top) {
          result.push(`\x1b[38;2;${top[0]};${top[1]};${top[2]}m▀${reset}`)
        } else if (bottom) {
          result.push(`\x1b[38;2;10;10;10m\x1b[48;2;${bottom[0]};${bottom[1]};${bottom[2]}m▀${reset}`)
        } else {
          result.push(" ")
        }
      } else {
        result.push(top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ")
      }
    }
    result.push(EOL)
  }
  return result.join("").trimEnd()
}

export async function input(prompt: string): Promise<string> {
  const readline = require("readline")
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(prompt, (answer: string) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export function error(message: string) {
  if (message.startsWith("Error: ")) {
    message = message.slice("Error: ".length)
  }
  println(Style.TEXT_DANGER_BOLD + "Error: " + Style.TEXT_NORMAL + message)
}

export function markdown(text: string): string {
  return text
}

export * as UI from "./ui"
