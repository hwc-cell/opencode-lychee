import { DEFAULT_THEMES } from "../context/theme"
import type { Tip } from "./tips"
import { commandText, press, shortcutText } from "./tips"

const themeCount = Object.keys(DEFAULT_THEMES).length

export const tips: Tip[] = [
  "输入 {highlight}@{/highlight} 后跟文件名，可模糊搜索并附加文件",
  "以 {highlight}!{/highlight} 开头输入消息可直接运行 shell 命令（例如 {highlight}!ls -la{/highlight}）",
  (shortcuts) => press(shortcuts.agentCycle(), "在 Build 与 Plan 代理之间切换"),
  "使用 {highlight}/undo{/highlight} 撤销上一条消息和文件更改",
  "使用 {highlight}/redo{/highlight} 恢复之前撤销的消息和文件更改",
  "运行 {highlight}/share{/highlight} 生成一个公开分享链接",
  "可将图片或 PDF 拖入终端作为上下文",
  (shortcuts) => press(shortcuts.inputPaste(), "从剪贴板粘贴图片到提示词输入"),
  (shortcuts) => `使用 ${commandText("/editor", shortcuts.editorOpen())} 在外部编辑器中撰写消息`,
  "运行 {highlight}/init{/highlight} 根据代码库自动生成项目规则",
  (shortcuts) => `使用 ${commandText("/models", shortcuts.modelList())} 切换可用的 AI 模型`,
  (shortcuts) => `使用 ${commandText("/themes", shortcuts.themeList())} 在 ${themeCount} 个内置主题间切换`,
  (shortcuts) => `使用 ${commandText("/new", shortcuts.sessionNew())} 开启全新会话`,
  (shortcuts) => `使用 ${commandText("/sessions", shortcuts.sessionList())} 列出、固定并继续会话`,
  (shortcuts) => press(shortcuts.sessionPinToggle(), "在会话列表中将某个会话固定到顶部"),
  (shortcuts) =>
    shortcuts.sessionQuickSwitch1() && shortcuts.sessionQuickSwitch9()
      ? `使用 ${shortcutText(shortcuts.sessionQuickSwitch1())} 到 ${shortcutText(shortcuts.sessionQuickSwitch9())} 在已固定会话间切换`
      : undefined,
  "运行 {highlight}/compact{/highlight} 在接近上下文上限时总结长会话",
  (shortcuts) => `使用 ${commandText("/export", shortcuts.sessionExport())} 将对话保存为 Markdown`,
  (shortcuts) => press(shortcuts.messagesCopy(), "将助手的上一条消息复制到剪贴板"),
  (shortcuts) => press(shortcuts.commandList(), "查看所有可用的操作与命令"),
  "运行 {highlight}/connect{/highlight} 为 75+ 个受支持的 LLM 供应商添加 API 密钥",
  (shortcuts) => `引导键是 ${shortcutText(shortcuts.leader())}；与其他按键组合可实现快捷操作`,
  (shortcuts) => press(shortcuts.modelCycleRecent(), "快速切换最近使用的模型"),
  (shortcuts) => press(shortcuts.sessionSidebarToggle(), "在会话中显示或隐藏侧边栏"),
  (shortcuts) =>
    shortcuts.messagesPageUp() && shortcuts.messagesPageDown()
      ? `使用 ${shortcutText(shortcuts.messagesPageUp())}/${shortcutText(shortcuts.messagesPageDown())} 浏览对话历史`
      : undefined,
  (shortcuts) => press(shortcuts.messagesFirst(), "跳到对话开头"),
  (shortcuts) => press(shortcuts.messagesLast(), "跳到最新消息"),
  (shortcuts) => press(shortcuts.inputNewline(), "在提示词中输入换行"),
  (shortcuts) => press(shortcuts.inputClear(), "输入时清空输入框"),
  (shortcuts) => press(shortcuts.sessionInterrupt(), "在 AI 回复中途停止"),
  "切换到 {highlight}Plan{/highlight} 代理获取建议但不做出更改",
  "在提示词中使用 {highlight}@agent-name{/highlight} 调用专门的子代理",
  (shortcuts) => {
    const items = [
      shortcuts.sessionParent(),
      shortcuts.childFirst(),
      shortcuts.childPrevious(),
      shortcuts.childNext(),
    ].filter(Boolean)
    if (!items.length) return undefined
    return `使用 ${items.map(shortcutText).join(" / ")} 在父/子会话之间切换`
  },
  "{highlight}opencode.json{/highlight} 用于服务端设置，{highlight}tui.json{/highlight} 用于 TUI",
  "将 TUI 设置放在 {highlight}~/.config/opencode/tui.json{/highlight} 以全局生效",
  "在配置中添加 {highlight}$schema{/highlight} 可在编辑器中获得自动补全",
  "在配置中设置 {highlight}model{/highlight} 以指定默认模型",
  "可在 {highlight}tui.json{/highlight} 的 {highlight}keybinds{/highlight} 部分覆盖任意按键绑定",
  "将任意按键绑定设为 {highlight}none{/highlight} 以完全禁用",
  "在配置的 {highlight}mcp{/highlight} 部分配置本地或远程 MCP 服务器",
  "在 {highlight}.opencode/commands/{/highlight} 中添加 {highlight}.md{/highlight} 文件以创建可复用的提示词",
  "在自定义命令中使用 {highlight}$ARGUMENTS{/highlight}、{highlight}$1{/highlight}、{highlight}$2{/highlight} 接收动态输入",
  "使用反引号注入 shell 输出（例如 {highlight}`git status`{/highlight}）",
  "在 {highlight}.opencode/agents/{/highlight} 中添加 {highlight}.md{/highlight} 文件以定义专用 AI 人格",
  "为 {highlight}edit{/highlight}、{highlight}bash{/highlight}、{highlight}webfetch{/highlight} 工具按代理配置权限",
  '使用 {highlight}"git *": "allow"{/highlight} 等模式进行细粒度的 bash 权限控制',
  '设置 {highlight}"rm -rf *": "deny"{/highlight} 以阻止破坏性命令',
  '配置 {highlight}"git push": "ask"{/highlight} 在推送前要求批准',
  '设置 {highlight}"formatter": true{/highlight} 启用内置格式化器',
  '设置 {highlight}"formatter": false{/highlight} 禁用继承的格式化器',
  "在配置中用文件扩展名定义自定义格式化命令",
  '设置 {highlight}"lsp": true{/highlight} 启用内置 LSP 代码分析',
  "在 {highlight}.opencode/tools/{/highlight} 中创建 {highlight}.ts{/highlight} 文件以定义新的 LLM 工具",
  "工具定义可以调用用 Python、Go 等语言编写的脚本",
  "在 {highlight}.opencode/plugins/{/highlight} 中添加 {highlight}.ts{/highlight} 文件以挂钩事件",
  "使用插件在会话完成时发送系统通知",
  "创建插件阻止 OpenCode 读取敏感文件",
  "使用 {highlight}opencode run{/highlight} 进行非交互式脚本编写",
  "使用 {highlight}opencode --continue{/highlight} 恢复上一个会话",
  "使用 {highlight}opencode run -f file.ts{/highlight} 通过 CLI 附加文件",
  "在脚本中使用 {highlight}--format json{/highlight} 输出机器可读结果",
  "运行 {highlight}opencode serve{/highlight} 以无界面 API 方式访问 OpenCode",
  "使用 {highlight}opencode run --attach{/highlight} 连接正在运行的服务器",
  "运行 {highlight}opencode upgrade{/highlight} 升级到最新版本",
  "运行 {highlight}opencode auth list{/highlight} 查看所有已配置的供应商",
  "运行 {highlight}opencode agent create{/highlight} 引导式创建代理",
  "在 GitHub issue/PR 中使用 {highlight}/opencode{/highlight} 触发 AI 操作",
  "运行 {highlight}opencode github install{/highlight} 设置 GitHub 工作流",
  "在 issue 中评论 {highlight}/opencode fix this{/highlight} 自动创建 PR",
  "在 PR 代码行评论 {highlight}/oc{/highlight} 进行针对性代码审查",
  '使用 {highlight}"theme": "system"{/highlight} 匹配终端的颜色',
  "在 {highlight}.opencode/themes/{/highlight} 目录创建 JSON 主题文件",
  "主题支持两种模式的深色/浅色变体",
  "在自定义主题 JSON 中使用 0-255 的数字 xterm 颜色代码",
  "在配置中使用 {highlight}{env:VAR_NAME}{/highlight} 引用环境变量",
  "使用 {highlight}{file:path}{/highlight} 在配置值中包含文件内容",
  "在配置中使用 {highlight}instructions{/highlight} 加载额外规则文件",
  "将代理 {highlight}temperature{/highlight} 设为 0.0（专注）到 1.0（创意）",
  "配置 {highlight}steps{/highlight} 限制每次请求的代理迭代次数",
  '设置 {highlight}"tools": {"bash": false}{/highlight} 禁用特定工具',
  '设置 {highlight}"mcp_*": false{/highlight} 禁用某个 MCP 服务器的所有工具',
  "可以按代理配置覆盖全局工具设置",
  '设置 {highlight}"share": "auto"{/highlight} 自动分享所有会话',
  '设置 {highlight}"share": "disabled"{/highlight} 禁止任何会话分享',
  "运行 {highlight}/unshare{/highlight} 移除会话的公开访问",
  "权限 {highlight}doom_loop{/highlight} 防止无限工具调用循环",
  "权限 {highlight}external_directory{/highlight} 保护项目外的文件",
  "运行 {highlight}opencode debug config{/highlight} 排查配置问题",
  "使用 {highlight}--print-logs{/highlight} 参数在 stderr 查看详细日志",
  (shortcuts) => `使用 ${commandText("/timeline", shortcuts.sessionTimeline())} 跳转到指定消息`,
  (shortcuts) => press(shortcuts.messagesToggleConceal(), "切换消息中代码块的可见性"),
  (shortcuts) => `使用 ${commandText("/status", shortcuts.statusView())} 查看系统状态信息`,
  "在 {highlight}tui.json{/highlight} 中启用 {highlight}scroll_acceleration{/highlight} 获得平滑滚动",
  (shortcuts) =>
    shortcuts.commandList()
      ? `通过命令面板切换聊天中的用户名显示（${shortcutText(shortcuts.commandList())}）`
      : "通过命令面板切换聊天中的用户名显示",
  "在容器中运行 {highlight}docker run -it --rm ghcr.io/anomalyco/opencode{/highlight}",
  "使用 {highlight}/connect{/highlight} 连接 OpenCode Zen 获取精心测试的模型",
  "将项目的 {highlight}AGENTS.md{/highlight} 文件提交到 Git 供团队共享",
  "使用 {highlight}/review{/highlight} 审查未提交的更改、分支或 PR",
  (shortcuts) => `使用 ${commandText("/help", shortcuts.helpShow())} 显示帮助对话框`,
  "使用 {highlight}/rename{/highlight} 重命名当前会话",
]

export const inputUndoTip: Tip = (shortcuts) => press(shortcuts.inputUndo(), "撤销提示词中的更改")
export const terminalSuspendTip: Tip = (shortcuts) =>
  press(shortcuts.terminalSuspend(), "挂起终端并返回 shell")
