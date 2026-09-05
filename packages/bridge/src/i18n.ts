// 桥显示语言: 默认中文, 设置 OPENCODE_LANG=en(或 en_US/en_GB...) 切英文。
// TUI/CLI 的 i18n 在各自包内; 桥独立维护最小文案集。

export type BridgeLang = "zh" | "en"

export function bridgeLang(): BridgeLang {
  const raw = process.env.OPENCODE_LANG ?? process.env.LYCHEE_LANG ?? "zh"
  return raw.toLowerCase().startsWith("en") ? "en" : "zh"
}

const messages: Record<BridgeLang, Record<string, string>> = {
  zh: {
    timeout: "⚡️模型超时,已尝试{n}/3次",
    interrupted: "⚡️已打断,当前运行:{what}",
    thinking: "思考中…",
    runningTool: "运行工具 {tool}",
    busy: "⏳ 上一条消息还在处理中,完成后再回复你~",
    error: "😅 哎呀,处理出错了,请稍后再试~",
    noReply: "😅 没有拿到回复,请稍后再试一次吧~",
    failed3: "😅 已重试3次仍然失败,请稍后再试~",
    noSession: "⚠️ 创建会话失败,请稍后再试。",
    created: "🍈 荔枝已就绪,直接发消息即可(输入 /halp 查看指令)",
    // 聊天指令
    cmdHelp: [
      "🤖 可用指令:",
      "· /autostart —— 开启后台常驻(开机自启, 崩溃重启)",
      "· /autostop —— 关闭后台常驻",
      "· /halp —— 查看本帮助",
      "其他消息直接说, 就是你的 AI 啦~",
    ].join("\n"),
    cmdOwnerOnly: "🔒 只有扫码登录的账号才能操作哦",
    cmdAlreadyOn: "后台常驻已是开启状态(无需重复)",
    cmdOn: "已开启后台常驻(开机自启 + 崩溃自动重启)",
    cmdOff: "已关闭后台常驻",
    cmdNotFound: "⚠️ 后台常驻仅支持 macOS",
    cmdMissingLauncher: "未找到启动器, 请先执行: cp packages/opencode/lychee.sh ~/.local/bin/OpenCode-Lychee && chmod +x ~/.local/bin/OpenCode-Lychee",
    cmdLaunchFailed: "launchctl 加载失败, 请手动检查 plist 文件",
    cmdNotInstalled: "未开启过后台常驻",
    cmdNotDarwin: "非 macOS, 无 launchd 配置可移除",
    cmdLogPrefix: "后台常驻",
  },
  en: {
    timeout: "⚡️ Model timeout, attempt {n}/3",
    interrupted: "⚡️ Interrupted, now running: {what}",
    thinking: "thinking…",
    runningTool: "running tool {tool}",
    busy: "⏳ Still processing your last message. I'll reply once it's done~",
    error: "😅 Oops, something went wrong. Please try again~",
    noReply: "😅 No reply yet, please try again~",
    failed3: "😅 Still failing after 3 attempts, please try again~",
    noSession: "⚠️ Failed to create session, please try again later.",
    created: "🍈 Lychee is ready, just send a message (/halp for commands)",
    cmdHelp: [
      "🤖 Available commands:",
      "· /autostart — enable background daemon (auto-start on boot, auto-restart)",
      "· /autostop — disable background daemon",
      "· /halp — show this help",
      "Anything else goes straight to your AI~",
    ].join("\n"),
    cmdOwnerOnly: "🔒 Only the account that scanned the QR code can do that",
    cmdAlreadyOn: "Background daemon is already enabled",
    cmdOn: "Background daemon enabled (auto-start + auto-restart)",
    cmdOff: "Background daemon disabled",
    cmdNotFound: "⚠️ Background daemon requires macOS",
    cmdMissingLauncher: "Launcher not found. Run: cp packages/opencode/lychee.sh ~/.local/bin/OpenCode-Lychee && chmod +x ~/.local/bin/OpenCode-Lychee",
    cmdLaunchFailed: "launchctl failed to load, check the plist file manually",
    cmdNotInstalled: "Background daemon was never enabled",
    cmdNotDarwin: "Not macOS, nothing to remove",
    cmdLogPrefix: "daemon",
  },
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let text = messages[bridgeLang()][key] ?? messages.zh[key] ?? key
  for (const [name, value] of Object.entries(vars ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}
