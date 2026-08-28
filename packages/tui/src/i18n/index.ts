import { dict as enDict, placeholders as enPlaceholders, type Placeholders } from "./en"
import { dict as zhDict, placeholders as zhPlaceholders } from "./zh"
import type { Dict } from "./types"
import { tips as enTips, inputUndoTip as enInputUndoTip, terminalSuspendTip as enTerminalSuspendTip } from "./tips-en"
import { tips as zhTips, inputUndoTip as zhInputUndoTip, terminalSuspendTip as zhTerminalSuspendTip } from "./tips-zh"
import type { Shortcuts, Tip } from "./tips"

export type Locale = "en" | "zh"

export const LOCALES: Locale[] = ["en", "zh"]

function resolveLocale(): Locale {
  const raw = process.env.OPENCODE_LANG || process.env.LANG || process.env.LC_ALL || ""
  const value = raw.toLowerCase().replace(/_/g, "-")
  if (value.startsWith("zh-cn") || value.startsWith("zh-sg") || value.startsWith("zh-hans") || value === "zh") {
    return "zh"
  }
  return "en"
}

export const locale: Locale = resolveLocale()

export const dict: Dict = locale === "zh" ? zhDict : enDict

export function t(key: string, params?: Record<string, string | number>): string {
  let value = dict[key] ?? enDict[key] ?? key
  if (params) {
    for (const [name, param] of Object.entries(params)) {
      value = value.replaceAll(`{${name}}`, String(param))
    }
  }
  return value
}

export const tips: Tip[] = locale === "zh" ? zhTips : enTips

export const inputUndoTip: Tip = locale === "zh" ? zhInputUndoTip : enInputUndoTip
export const terminalSuspendTip: Tip = locale === "zh" ? zhTerminalSuspendTip : enTerminalSuspendTip

export const placeholders: Placeholders = locale === "zh" ? zhPlaceholders : enPlaceholders

// Re-exported so components can render translations that are shared with the
// web app or other surfaces if needed in the future.
export type { Dict, Shortcuts, Tip }
