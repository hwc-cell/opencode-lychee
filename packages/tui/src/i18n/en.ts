import type { Dict } from "./types"

export const dict: Dict = {
  // Tips
  "tips.label": "Tip",
  "tips.noModels": "Run {highlight}/connect{/highlight} to add an AI provider and start coding",
  "tips.show": "Show tips",
  "tips.hide": "Hide tips",

  // Home
  "home.footer.mcp": "{count} MCP",

  // Dialog
  "dialog.confirm": "Confirm",
  "dialog.cancel": "Cancel",
  "dialog.confirm.desc": "Confirm dialog selection",
  "dialog.prev.desc": "Previous dialog option",
  "dialog.next.desc": "Next dialog option",

  // Permission
  "permission.required": "Permission required",
  "permission.always": "Always allow",
  "permission.always.until": "This will allow {permission} until OpenCode is restarted.",
  "permission.always.patterns": "This will allow the following patterns until OpenCode is restarted",
  "permission.once": "Allow once",
  "permission.reject": "Reject",
  "permission.reject.title": "Reject permission",
  "permission.reject.message": "Tell OpenCode what to do differently",
  "permission.reject.confirm.desc": "Confirm permission rejection",
  "permission.reject.cancel.desc": "Cancel permission rejection",
  "permission.noDiff": "No diff provided",
  "permission.edit": "Edit {path}",
  "permission.read": "Read {path}",
  "permission.path": "Path: {path}",
  "permission.glob": 'Glob "{pattern}"',
  "permission.grep": 'Grep "{pattern}"',
  "permission.pattern": "Pattern: {pattern}",
  "permission.list": "List {path}",
  "permission.shell": "Shell command",
  "permission.task": "{type} Task",
  "permission.webfetch": "WebFetch {url}",
  "permission.url": "URL: {url}",
  "permission.websearch": '{provider} "{query}"',
  "permission.query": "Query: {query}",
  "permission.externalDirectory": "Access external directory {dir}",
  "permission.patterns": "Patterns",
  "permission.doomLoop": "Continue after repeated failures",
  "permission.doomLoop.body": "This keeps the session running despite repeated failures.",
  "permission.callTool": "Call tool {permission}",
  "permission.tool": "Tool: {permission}",
  "permission.select": "select",
  "permission.confirm": "confirm",
  "permission.cancel": "cancel",
  "permission.minimize": "minimize",
  "permission.fullscreen": "fullscreen",
  "permission.toggleFullscreen.desc": "Toggle permission fullscreen",
  "permission.prev.desc": "Previous permission option",
  "permission.next.desc": "Next permission option",
  "permission.selectOption.desc": "Select permission option",

  // Session epilogue
  "epilogue.session": "Session",
  "epilogue.continue": "Continue",

  // Session commands
  "session.copyShareLink": "Copy share link",
  "session.share": "Share session",
  "session.shareConfirm": "Are you sure you want to share it?",
  "session.shareCopied": "Share URL copied to clipboard!",
  "session.shareCopyFailed": "Failed to copy URL to clipboard",
  "session.shareFailed": "Failed to share session",
  "session.rename": "Rename session",
  "session.jumpToMessage": "Jump to message",
  "session.retryError": "Retry Error",

  // Prompt
  "prompt.connectProvider": "Connect a provider to send prompts",
  "prompt.clear": "Clear prompt",
  "prompt.submit": "Submit prompt",
  "prompt.removeEditorContext": "Remove editor context",
  "prompt.paste": "Paste",
  "prompt.interrupt": "Interrupt session",
  "prompt.openEditor": "Open editor",
  "prompt.skills": "Skills",
  "prompt.warp": "Warp",
  "prompt.warp.desc": "Change the workspace for the session",
  "prompt.moveSession": "Move session",
  "prompt.moveSession.desc": "Move to another project dir",
  "prompt.stash": "Stash prompt",
  "prompt.stashPop": "Stash pop",
  "prompt.stashList": "Stash list",
  "prompt.shellMode.desc": "Shell mode",
  "prompt.exitShell.desc": "Exit shell mode",
  "prompt.historyPrev": "Previous prompt history",
  "prompt.historyNext": "Next prompt history",
  "prompt.createFailed": "Creating a session failed. Open console for more details.",
  "prompt.sendFailed": "Failed to send prompt",
  "prompt.shell": "Shell",
}

export type Placeholders = { normal: string[]; shell: string[] }

export const placeholders: Placeholders = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}
