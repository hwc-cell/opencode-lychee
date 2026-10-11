import type { SessionMessageInfo, SessionTransferData } from "@opencode/client"
import { Plugin } from "@opencode/plugin/tui"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

function markdownSafe(value: string) {
  return value
    .replace(/[\\/:*?"<>|#\s]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
}

function messageText(message: SessionMessageInfo) {
  if (message.type === "user" || message.type === "synthetic" || message.type === "system") return message.text
  if (message.type === "assistant")
    return message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n")
  if (message.type === "shell") return `$ ${message.command}\n${message.output ?? ""}`
  if (message.type === "compaction" && message.status === "completed") return message.summary
  return ""
}

function transcript(data: SessionTransferData) {
  const lines = [
    `# 会话「${data.info.title ?? data.info.id}」`,
    "",
    `会话 ID: ${data.info.id}`,
    `目录: ${data.info.location.directory}`,
    "",
  ]
  data.messages.forEach((message) => {
    const text = messageText(message).trim()
    if (!text) return
    const role = message.type === "assistant" ? "助手" : message.type === "user" ? "用户" : "系统"
    lines.push(`> ${role}`, text, "")
  })
  return lines.join("\n").slice(0, 40_000)
}

function replyText(messages: SessionMessageInfo[]) {
  const assistant = messages.find((message) => message.type === "assistant")
  if (!assistant || assistant.type !== "assistant") return
  const text = assistant.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
    .trim()
  return text || undefined
}

export default Plugin.define({
  id: "lychee.summary",
  setup(context) {
    const [settings, update] = context.storage.store("lychee-summary", { initial: { enabled: false } })
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "lychee.summary.toggle",
          title: settings.enabled ? "关闭荔枝小结" : "开启荔枝小结",
          group: "Lychee",
          slash: { name: "summary", aliases: ["lycheexj"] },
          palette: true,
          async run() {
            const enabled = !settings.enabled
            await update((draft) => {
              draft.enabled = enabled
            })
            context.ui.dialog.clear()
            context.ui.toast.show({
              variant: enabled ? "success" : "info",
              message: enabled ? "已开启：退出 TUI 时自动生成荔枝小结" : "已关闭荔枝小结",
            })
          },
        },
      ],
    }))

    return async () => {
      if (!settings.enabled) return
      const route = context.ui.router.current()
      if (route.type !== "session") return
      const info = context.data.session.get(route.sessionID)
      if (!info) return

      process.stderr.write("\n🍈 正在生成荔枝小结…\n")
      const data = await context.client.session.export({ sessionID: route.sessionID })
      const reportDir = path.join(info.location.directory, ".opencode", "reports")
      const report = path.join(reportDir, `${markdownSafe(info.title ?? info.id)}-${info.id.slice(-6)}.md`)
      const previous = await readFile(report, "utf8").catch(() => "")
      const temporary = await context.client.session.create({
        title: "Lychee session summary",
        location: { directory: info.location.directory },
      })
      try {
        await context.client.session.prompt({
          sessionID: temporary.id,
          text: previous
            ? "请用中文总结本次续接相对上次小结的新增进展。输出 Markdown，包含：做了什么、新结论或产出、继续建议。不要重复旧内容，不要编造。\n\n" +
              `【上次小结】\n${previous.slice(0, 6000)}\n\n【本次会话】\n${transcript(data)}`
            : "请用中文总结下面这段 AI 编码会话。输出 Markdown，包含：做了什么、主要结论或产出、后续建议。不要编造。\n\n" +
              transcript(data),
        })
        await context.client.session.wait({ sessionID: temporary.id })
        const result = await context.client.message.list({ sessionID: temporary.id, limit: 20, order: "desc" })
        const reply = replyText(result.data)
        if (!reply) {
          process.stderr.write("🍈 未获得小结回复\n")
          return
        }
        await mkdir(reportDir, { recursive: true })
        const body = previous
          ? `${previous}\n\n---\n\n## 🍈 续接小结\n\n> 续接于: ${new Date().toISOString()}\n\n${reply.replace(/^#+ .{0,40}\n+/u, "")}`
          : `# 🍈 荔枝小结\n\n> 来源会话: ${info.title ?? info.id} (${info.id})\n> 生成于: ${new Date().toISOString()}\n\n${reply}`
        await writeFile(report, body)
        process.stderr.write(`🍈 小结已保存: ${report}\n`)
      } catch (error) {
        process.stderr.write(`🍈 小结生成失败: ${error instanceof Error ? error.message : String(error)}\n`)
      } finally {
        await context.client.session.remove({ sessionID: temporary.id }).catch(() => undefined)
      }
    }
  },
})
