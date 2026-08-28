import { DEFAULT_THEMES } from "../context/theme"
import type { Tip } from "./tips"
import { commandText, press, shortcutText } from "./tips"

const themeCount = Object.keys(DEFAULT_THEMES).length

export const tips: Tip[] = [
  "Type {highlight}@{/highlight} followed by a filename to fuzzy search and attach files",
  "Start a message with {highlight}!{/highlight} to run shell commands (e.g., {highlight}!ls -la{/highlight})",
  (shortcuts) => press(shortcuts.agentCycle(), "to cycle between Build and Plan agents"),
  "Use {highlight}/undo{/highlight} to revert the last message and file changes",
  "Use {highlight}/redo{/highlight} to restore previously undone messages and file changes",
  "Run {highlight}/share{/highlight} to create a public opencode.ai link",
  "Drag and drop images or PDFs into the terminal as context",
  (shortcuts) => press(shortcuts.inputPaste(), "to paste images from your clipboard into the prompt"),
  (shortcuts) => `Use ${commandText("/editor", shortcuts.editorOpen())} to compose messages in your external editor`,
  "Run {highlight}/init{/highlight} to auto-generate project rules based on your codebase",
  (shortcuts) => `Use ${commandText("/models", shortcuts.modelList())} to switch between available AI models`,
  (shortcuts) => `Use ${commandText("/themes", shortcuts.themeList())} to switch between ${themeCount} built-in themes`,
  (shortcuts) => `Use ${commandText("/new", shortcuts.sessionNew())} to start a fresh conversation session`,
  (shortcuts) => `Use ${commandText("/sessions", shortcuts.sessionList())} to list, pin, and continue sessions`,
  (shortcuts) => press(shortcuts.sessionPinToggle(), "in the session list to pin one at the top"),
  (shortcuts) =>
    shortcuts.sessionQuickSwitch1() && shortcuts.sessionQuickSwitch9()
      ? `Use ${shortcutText(shortcuts.sessionQuickSwitch1())} through ${shortcutText(shortcuts.sessionQuickSwitch9())} to switch pinned sessions`
      : undefined,
  "Run {highlight}/compact{/highlight} to summarize long sessions near context limits",
  (shortcuts) => `Use ${commandText("/export", shortcuts.sessionExport())} to save the conversation as Markdown`,
  (shortcuts) => press(shortcuts.messagesCopy(), "to copy the assistant's last message to clipboard"),
  (shortcuts) => press(shortcuts.commandList(), "to see all available actions and commands"),
  "Run {highlight}/connect{/highlight} to add API keys for 75+ supported LLM providers",
  (shortcuts) => `The leader key is ${shortcutText(shortcuts.leader())}; combine with other keys for quick actions`,
  (shortcuts) => press(shortcuts.modelCycleRecent(), "to quickly switch between recently used models"),
  (shortcuts) => press(shortcuts.sessionSidebarToggle(), "in a session to show or hide the sidebar panel"),
  (shortcuts) =>
    shortcuts.messagesPageUp() && shortcuts.messagesPageDown()
      ? `Use ${shortcutText(shortcuts.messagesPageUp())}/${shortcutText(shortcuts.messagesPageDown())} to navigate through conversation history`
      : undefined,
  (shortcuts) => press(shortcuts.messagesFirst(), "to jump to the beginning of the conversation"),
  (shortcuts) => press(shortcuts.messagesLast(), "to jump to the most recent message"),
  (shortcuts) => press(shortcuts.inputNewline(), "to add newlines in your prompt"),
  (shortcuts) => press(shortcuts.inputClear(), "when typing to clear the input field"),
  (shortcuts) => press(shortcuts.sessionInterrupt(), "to stop the AI mid-response"),
  "Switch to {highlight}Plan{/highlight} agent for suggestions without making changes",
  "Use {highlight}@agent-name{/highlight} in prompts to invoke specialized subagents",
  (shortcuts) => {
    const items = [
      shortcuts.sessionParent(),
      shortcuts.childFirst(),
      shortcuts.childPrevious(),
      shortcuts.childNext(),
    ].filter(Boolean)
    if (!items.length) return undefined
    return `Use ${items.map(shortcutText).join(" / ")} for parent/child sessions`
  },
  "Create {highlight}opencode.json{/highlight} for server settings, and {highlight}tui.json{/highlight} for TUI",
  "Place TUI settings in {highlight}~/.config/opencode/tui.json{/highlight} for global config",
  "Add {highlight}$schema{/highlight} to your config for autocomplete in your editor",
  "Configure {highlight}model{/highlight} in config to set your default model",
  "Override any keybind in {highlight}tui.json{/highlight} via the {highlight}keybinds{/highlight} section",
  "Set any keybind to {highlight}none{/highlight} to disable it completely",
  "Configure local or remote MCP servers in the {highlight}mcp{/highlight} config section",
  "Add {highlight}.md{/highlight} files to {highlight}.opencode/commands/{/highlight} for reusable prompts",
  "Use {highlight}$ARGUMENTS{/highlight}, {highlight}$1{/highlight}, {highlight}$2{/highlight} in custom commands for dynamic input",
  "Use backticks to inject shell output (e.g., {highlight}`git status`{/highlight})",
  "Add {highlight}.md{/highlight} files to {highlight}.opencode/agents/{/highlight} for specialized AI personas",
  "Configure per-agent permissions for {highlight}edit{/highlight}, {highlight}bash{/highlight}, and {highlight}webfetch{/highlight} tools",
  'Use patterns like {highlight}"git *": "allow"{/highlight} for granular bash permissions',
  'Set {highlight}"rm -rf *": "deny"{/highlight} to block destructive commands',
  'Configure {highlight}"git push": "ask"{/highlight} to require approval before pushing',
  'Set {highlight}"formatter": true{/highlight} to enable built-in formatters',
  'Set {highlight}"formatter": false{/highlight} to disable inherited formatters',
  "Define custom formatter commands with file extensions in config",
  'Set {highlight}"lsp": true{/highlight} to enable built-in LSP code analysis',
  "Create {highlight}.ts{/highlight} files in {highlight}.opencode/tools/{/highlight} to define new LLM tools",
  "Tool definitions can invoke scripts written in Python, Go, etc",
  "Add {highlight}.ts{/highlight} files to {highlight}.opencode/plugins/{/highlight} for event hooks",
  "Use plugins to send OS notifications when sessions complete",
  "Create a plugin to prevent OpenCode from reading sensitive files",
  "Use {highlight}opencode run{/highlight} for non-interactive scripting",
  "Use {highlight}opencode --continue{/highlight} to resume the last session",
  "Use {highlight}opencode run -f file.ts{/highlight} to attach files via CLI",
  "Use {highlight}--format json{/highlight} for machine-readable output in scripts",
  "Run {highlight}opencode serve{/highlight} for headless API access to OpenCode",
  "Use {highlight}opencode run --attach{/highlight} to connect to a running server",
  "Run {highlight}opencode upgrade{/highlight} to update to the latest version",
  "Run {highlight}opencode auth list{/highlight} to see all configured providers",
  "Run {highlight}opencode agent create{/highlight} for guided agent creation",
  "Use {highlight}/opencode{/highlight} in GitHub issues/PRs to trigger AI actions",
  "Run {highlight}opencode github install{/highlight} to set up the GitHub workflow",
  "Comment {highlight}/opencode fix this{/highlight} on issues to auto-create PRs",
  "Comment {highlight}/oc{/highlight} on PR code lines for targeted code reviews",
  'Use {highlight}"theme": "system"{/highlight} to match your terminal\'s colors',
  "Create JSON theme files in {highlight}.opencode/themes/{/highlight} directory",
  "Themes support dark/light variants for both modes",
  "Use numeric xterm color codes 0-255 in custom theme JSON",
  "Use {highlight}{env:VAR_NAME}{/highlight} for environment variables in config",
  "Use {highlight}{file:path}{/highlight} to include file contents in config values",
  "Use {highlight}instructions{/highlight} in config to load additional rules files",
  "Set agent {highlight}temperature{/highlight} from 0.0 (focused) to 1.0 (creative)",
  "Configure {highlight}steps{/highlight} to limit agentic iterations per request",
  'Set {highlight}"tools": {"bash": false}{/highlight} to disable specific tools',
  'Set {highlight}"mcp_*": false{/highlight} to disable all tools from an MCP server',
  "Override global tool settings per agent configuration",
  'Set {highlight}"share": "auto"{/highlight} to automatically share all sessions',
  'Set {highlight}"share": "disabled"{/highlight} to prevent any session sharing',
  "Run {highlight}/unshare{/highlight} to remove a session from public access",
  "Permission {highlight}doom_loop{/highlight} prevents infinite tool call loops",
  "Permission {highlight}external_directory{/highlight} protects files outside project",
  "Run {highlight}opencode debug config{/highlight} to troubleshoot configuration",
  "Use {highlight}--print-logs{/highlight} flag to see detailed logs in stderr",
  (shortcuts) => `Use ${commandText("/timeline", shortcuts.sessionTimeline())} to jump to specific messages`,
  (shortcuts) => press(shortcuts.messagesToggleConceal(), "to toggle code block visibility in messages"),
  (shortcuts) => `Use ${commandText("/status", shortcuts.statusView())} to see system status info`,
  "Enable {highlight}scroll_acceleration{/highlight} in {highlight}tui.json{/highlight} for smooth scrolling",
  (shortcuts) =>
    shortcuts.commandList()
      ? `Toggle username display in chat via the command palette (${shortcutText(shortcuts.commandList())})`
      : "Toggle username display in chat via the command palette",
  "Run {highlight}docker run -it --rm ghcr.io/anomalyco/opencode{/highlight} in a container",
  "Use {highlight}/connect{/highlight} with OpenCode Zen for curated, tested models",
  "Commit your project's {highlight}AGENTS.md{/highlight} file to Git for team sharing",
  "Use {highlight}/review{/highlight} to review uncommitted changes, branches, or PRs",
  (shortcuts) => `Use ${commandText("/help", shortcuts.helpShow())} to show the help dialog`,
  "Use {highlight}/rename{/highlight} to rename the current session",
]

export const inputUndoTip: Tip = (shortcuts) => press(shortcuts.inputUndo(), "to undo changes in your prompt")
export const terminalSuspendTip: Tip = (shortcuts) =>
  press(shortcuts.terminalSuspend(), "to suspend the terminal and return to your shell")
