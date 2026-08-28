import type { Accessor } from "solid-js"

export type Shortcuts = {
  agentCycle: Accessor<string>
  childFirst: Accessor<string>
  childNext: Accessor<string>
  childPrevious: Accessor<string>
  commandList: Accessor<string>
  editorOpen: Accessor<string>
  helpShow: Accessor<string>
  inputClear: Accessor<string>
  inputNewline: Accessor<string>
  inputPaste: Accessor<string>
  inputUndo: Accessor<string>
  leader: Accessor<string>
  messagesCopy: Accessor<string>
  messagesFirst: Accessor<string>
  messagesLast: Accessor<string>
  messagesPageDown: Accessor<string>
  messagesPageUp: Accessor<string>
  messagesToggleConceal: Accessor<string>
  modelCycleRecent: Accessor<string>
  modelList: Accessor<string>
  sessionExport: Accessor<string>
  sessionInterrupt: Accessor<string>
  sessionList: Accessor<string>
  sessionNew: Accessor<string>
  sessionParent: Accessor<string>
  sessionPinToggle: Accessor<string>
  sessionQuickSwitch1: Accessor<string>
  sessionQuickSwitch9: Accessor<string>
  sessionSidebarToggle: Accessor<string>
  sessionTimeline: Accessor<string>
  statusView: Accessor<string>
  terminalSuspend: Accessor<string>
  themeList: Accessor<string>
}

export type Tip = string | ((shortcuts: Shortcuts) => string | undefined)

export function shortcutText(value: string) {
  return `{highlight}${value}{/highlight}`
}

export function commandText(command: string, shortcut: string) {
  if (!shortcut) return shortcutText(command)
  return `${shortcutText(command)} or ${shortcutText(shortcut)}`
}

export function press(shortcut: string, text: string) {
  if (!shortcut) return undefined
  return `Press ${shortcutText(shortcut)} ${text}`
}
