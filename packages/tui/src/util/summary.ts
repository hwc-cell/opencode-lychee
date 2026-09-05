import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

// 结构化接口(避免依赖生成的 client 内部类型; TUI 的 sdk.client 满足此形状)
type SummarySdk = {
  client: {
    session: {
      create(input: { directory?: string; workspace?: string; agent?: string; model?: { id: string; providerID: string; variant?: string } }): Promise<{
        error?: unknown
        data?: { id?: string }
      }>
      prompt(input: {
        sessionID: string
        directory?: string
        workspace?: string
        parts: Array<{ type: "text"; text: string }>
      }): Promise<unknown>
      messages(input: { sessionID: string; directory?: string }): Promise<{
        data?: Array<{
          info?: { role?: string }
          parts?: Array<{ type?: string; text?: string }>
        }>
      }>
    }
  }
}

// ---------- 退出钩子注册表: 会话关闭(退出 TUI)时异步执行 ----------
type ExitHook = () => Promise<void>
const hooks = new Map<string, ExitHook>()

export function addExitHook(id: string, hook: ExitHook) {
  hooks.set(id, hook)
}

export async function runExitHooks() {
  for (const hook of [...hooks.values()]) {
    try {
      await Promise.race([hook(), sleep(120_000)])
    } catch {
      // 单个钩子失败不影响其他钩子
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------- 荔枝小结 ----------
type SummaryMessage = {
  id: string
  role: string
  parts?: Array<{ type?: string; text?: string; state?: { status?: string; input?: unknown } }>
}

function textOf(part: { type?: string; text?: string } | undefined): string | undefined {
  if (part?.type === "text" && typeof part.text === "string") return part.text
  return undefined
}

function buildTranscript(args: { title: string; sessionID: string; directory: string; messages: SummaryMessage[] }) {
  const lines: string[] = []
  lines.push(`# 会话「${args.title}」`, "")
  lines.push(`会话 ID: ${args.sessionID}`, `目录: ${args.directory}`, "")
  for (const message of args.messages) {
    const role = message.role === "assistant" ? "助手" : "用户"
    const parts = message.parts ?? []
    const textParts = parts.map(textOf).filter((text): text is string => Boolean(text))
    for (const text of textParts) {
      lines.push(`> ${role}`, text, "")
    }
    for (const part of parts) {
      if (part.type !== "text" && part.type !== "reasoning") {
        lines.push(`> 工具调用(${part.type ?? "?"})`, "")
      }
    }
  }
  return lines.join("\n").slice(0, 40_000)
}

function markdownSafe(name: string) {
  return name.replace(/[\\/:*?"<>|#\s]+/g, "-").replace(/-+/g, "-").slice(0, 40)
}

async function pollReply(sdk: SummarySdk, sessionID: string, directory: string): Promise<string | undefined> {
  for (let i = 0; i < 40; i++) {
    await sleep(3000)
    try {
      const res = await sdk.client.session.messages({ sessionID, directory })
      const rows = res.data ?? []
      for (const row of [...rows].reverse()) {
        if (row.info?.role !== "assistant") continue
        const text = (row.parts ?? []).map(textOf).filter((t): t is string => Boolean(t)).join("\n\n")
        if (text) return text
      }
    } catch {
      // 服务端可能还在处理, 继续轮询
    }
  }
  return undefined
}

export async function generateSessionSummary(args: {
  sdk: SummarySdk
  directory: string
  workspaceID?: string
  title: string
  sessionID: string
  messages: SummaryMessage[]
}): Promise<string | undefined> {
  const transcript = buildTranscript(args)

  // 会话续接: 已有小结时, 让 AI 追加"新增进展"章节, 不覆盖旧内容
  let previous = ""
  const reportDir = join(args.directory, ".opencode", "reports")
  const file = join(reportDir, `${markdownSafe(args.title)}-${args.sessionID.slice(-6)}.md`)
  try {
    previous = await readFile(file, "utf8")
  } catch {
    // 首次生成, 无旧小结
  }

  const created = await args.sdk.client.session.create({
    directory: args.directory,
    workspace: args.workspaceID,
  })
  if (created.error || !created.data?.id) return undefined
  const summarySessionID = created.data.id

  await args.sdk.client.session.prompt({
    sessionID: summarySessionID,
    directory: args.directory,
    workspace: args.workspaceID,
    parts: [
      {
        type: "text",
        text: previous
          ? "这是一次会话续接(之前已有小结, 见下方【上次小结】)。请用中文总结本次续接期间的" +
            "新增进展(与上次相比的增量), 输出 Markdown, 结构包括: 一、续接期间做了什么(要点列表); " +
            "二、新的结论/产出; 三、继续建议。不要重复上次内容, 不要超出会话内容编造。\n\n" +
            `【上次小结】\n${previous.slice(0, 6000)}\n\n` +
            `【本次会话完整内容】\n${transcript}`
          : "请用中文总结下面这段 AI 编码会话。输出 Markdown, 结构包括: 一、本次会话做了什么(要点列表); " +
            "二、主要结论/产出; 三、后续建议。不要超出会话内容编造。\n\n" +
            transcript,
      },
    ],
  })

  const reply = await pollReply(args.sdk, summarySessionID, args.directory)
  if (!reply) return undefined

  await mkdir(reportDir, { recursive: true })

  if (previous) {
    // 剥离 AI 回复自带的首行标题, 避免章节重复
    const body = reply.replace(/^#+ .{0,40}\n+/u, "")
    const content = `${previous}\n\n---\n\n## 🍈 续接小结\n\n> 续接于: ${new Date().toISOString()}\n\n${body}`
    await writeFile(file, content)
  } else {
    const content = `# 🍈 荔枝小结\n\n> 来源会话: ${args.title} (${args.sessionID})\n> 生成于: ${new Date().toISOString()}\n\n${reply}`
    await writeFile(file, content)
  }
  return file
}
