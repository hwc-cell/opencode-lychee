import { randomUUID } from "node:crypto"
import { t } from "./i18n"

// 通道无关的聊天代理核心: 处理"发消息给 AI -> 等待 -> 回复"全过程。
// 微信/Slack/Telegram/飞书 适配器共用, 自动获得:
//   - 运行中打断通知(⚡️已打断,当前运行:XXX)
//   - 模型超时自动重试(⚡️模型超时,已尝试X/3次), 按语言输出
//   - 按用户串行排队, 新消息打断旧任务后立即接管

export type BotSdk = {
  v2: {
    session: {
      create(parameters?: { id?: string; agent?: string; location?: { directory?: string; workspace?: string } }): Promise<unknown>
      prompt(parameters: { sessionID: string; id?: string; prompt?: { text: string }; delivery?: "steer" | "queue" }): Promise<unknown>
      wait(parameters: { sessionID: string }): Promise<unknown>
      interrupt(parameters: { sessionID: string }): Promise<unknown>
      messages(parameters: { sessionID: string; limit?: number; order?: "asc" | "desc" }): Promise<unknown>
    }
  }
}

export type DeliverArgs = {
  sdk: BotSdk
  sessionID: string
  text: string
  reply: (text: string) => Promise<void>
  notify?: (text: string) => Promise<void>
  stream?: (text: string) => Promise<void>
  log: (msg: string) => void
}

// 每次尝试的最长等待(看门狗), 超时视为模型超时; 可用 LYCHEE_MODEL_TIMEOUT_MS 覆盖
const MODEL_TIMEOUT_MS = Number(process.env.LYCHEE_MODEL_TIMEOUT_MS ?? 600_000)
// 运行中提醒间隔(默认 5 分钟); 可用 LYCHEE_WORK_REMINDER_MS 覆盖
const WORK_REMINDER_MS = Number(process.env.LYCHEE_WORK_REMINDER_MS ?? 300_000)
// 流式转发的最小发文字数: 每轮轮询(2s)攒够就发一条增量, 用户可实时看到模型打字
const MIN_STREAM_LEN = 4
const MAX_ATTEMPTS = 3

type RunState = {
  running: boolean
  info: string
  tool?: string
  abortedByUser: boolean
  streamed: string
  pending: string
}

const runState = new Map<string, RunState>()
const queues = new Map<string, Promise<void>>()

// 每个 key 串行执行任务; 已在队列中时新任务会排在旧任务之后
export function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve()
  const run = prev.catch(() => {}).then(task)
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  queues.set(key, tail)
  return run
}

export function isQueued(key: string): boolean {
  return queues.has(key)
}

type V2Session = BotSdk["v2"]["session"]

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function safeInterrupt(v2: V2Session, sessionID: string) {
  try {
    await v2.interrupt({ sessionID })
  } catch (error) {
    // interrupt 是尽力而为; 失败时等 server 自己停
  }
}

type AssistantMessage = {
  type?: string
  error?: { name?: string }
  content?: Array<{ type?: string; text?: string; name?: string; state?: { status?: string } }>
}

function rowsOf(res: unknown): AssistantMessage[] {
  const payload = res as { data?: { data?: AssistantMessage[] } | AssistantMessage[] }
  const inner = payload.data as { data?: AssistantMessage[] } | AssistantMessage[] | undefined
  if (Array.isArray(inner)) return inner
  return inner?.data ?? []
}

async function lastAssistant(v2: V2Session, sessionID: string): Promise<AssistantMessage | undefined> {
  const res = await v2.messages({ sessionID, limit: 10, order: "asc" }).catch(() => undefined)
  if (!res) return undefined
  const rows = rowsOf(res).filter((row) => row.type === "assistant")
  return rows.at(-1)
}

function assistantText(assistant: AssistantMessage): string {
  if (!assistant.content) return ""
  return assistant.content
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n\n")
}

// 原子取出待发缓冲再发送, 避免轮询 tick 与超时/完成路径竞态导致丢字或重复
async function flushPending(state: RunState, stream: (text: string) => Promise<void>, log: (msg: string) => void) {
  const chunk = state.pending
  if (!chunk) return
  state.pending = ""
  await stream(chunk)
  log(`📤 流式已发 (${chunk.length} 字)`)
}

// 轮询一次: 更新"当前运行"信息 + 流式转发模型已生成的新文本
async function poll(v2: V2Session, sessionID: string, state: RunState, stream: (text: string) => Promise<void>, log: (msg: string) => void) {
  try {
    const assistant = await lastAssistant(v2, sessionID)
    if (!assistant) return
    // 运行状态
    const runningTool = assistant.content?.find((part) => part.type === "tool" && part.state?.status !== "completed" && part.state?.status !== "error")
    if (runningTool?.name) {
      state.tool = runningTool.name
      state.info = t("runningTool", { tool: runningTool.name })
    } else {
      state.tool = undefined
      const text = assistantText(assistant)
      if (text) {
        const compact = text.replaceAll(/\s+/g, " ").trim().slice(-60)
        if (compact) state.info = compact
      }
    }
    // 流式增量: 模型重写(文本变短)时忽略
    if (assistant.error) return
    const full = assistantText(assistant)
    if (full.length < state.streamed.length) return
    const newPart = full.slice(state.streamed.length)
    if (newPart) {
      state.streamed = full
      state.pending += newPart
    }
    if (state.pending.length >= MIN_STREAM_LEN) await flushPending(state, stream, log)
  } catch (error) {
    log(`轮询失败: ${error instanceof Error ? error.message : error}`)
  }
}

// 等待会话变 idle; 每 2s 轮询(状态 + 流式)并定期发工作提醒, 看门狗超时返回 "timeout"
async function waitIdle(
  v2: V2Session,
  sessionID: string,
  state: RunState,
  log: (msg: string) => void,
  notify: (text: string) => Promise<void>,
  stream: (text: string) => Promise<void>,
): Promise<"idle" | "timeout"> {
  const startedAt = Date.now()
  let lastReminder = startedAt
  const timer = setInterval(() => {
    void (async () => {
      await poll(v2, sessionID, state, stream, log)
      const elapsed = Date.now() - startedAt
      if (elapsed - (lastReminder - startedAt) >= WORK_REMINDER_MS) {
        lastReminder = Date.now()
        const mins = Math.max(1, Math.floor(elapsed / 60_000))
        await notify(t("stillWorking", { m: mins, extra: state.tool ? t("stillWorkingTool", { tool: state.tool }) : "" }))
        log(`工作提醒: 已工作约 ${mins} 分钟${state.tool ? ` (${state.tool})` : ""}`)
      }
    })().catch(() => {})
  }, 2000)
  void poll(v2, sessionID, state, stream, log)
  try {
    const outcome = await Promise.race([
      v2.wait({ sessionID }).then(() => "idle" as const),
      sleep(MODEL_TIMEOUT_MS).then(() => "timeout" as const),
    ])
    return outcome
  } catch (error) {
    log(`wait 出错: ${error instanceof Error ? error.message : error}`)
    return "idle" // 连接错误: 回到检查消息的路径, 由 error 判定决定重试/结束
  } finally {
    clearInterval(timer)
  }
}

// 用户在当前运行中又发了新消息: 打断并通知, 旧任务随后静默结束
export async function interruptCurrent(args: { sdk: BotSdk; sessionID: string; reply: (text: string) => Promise<void>; log: (msg: string) => void }): Promise<boolean> {
  const state = runState.get(args.sessionID)
  if (!state?.running) return false
  state.abortedByUser = true
  await safeInterrupt(args.sdk.v2.session, args.sessionID)
  await args.reply(t("interrupted", { what: state.info || t("thinking") }))
  args.log(`已打断运行中的对话 (${args.sessionID})`)
  return true
}

export async function deliverMessage(args: DeliverArgs): Promise<void> {
  const { sdk, sessionID, text, reply, log } = args
  const notify = args.notify ?? reply
  const stream = args.stream ?? reply
  const v2 = sdk.v2.session
  // 理论上队列已保证串行; 防御: 若仍处于运行中则先打断
  const prev = runState.get(sessionID)
  if (prev?.running) {
    prev.abortedByUser = true
    await safeInterrupt(v2, sessionID)
    await sleep(500)
  }

  const state: RunState = { running: true, info: t("thinking"), abortedByUser: false, streamed: "", pending: "" }
  runState.set(sessionID, state)
  log(`🤖 开始处理 (${sessionID}): ${text.slice(0, 20)}…`)
  await notify(t("started"))
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // 每次尝试使用新 id: 失败后复用同 id 会触发 server 的 PromptConflict(exact-retry 只对未失败的输入有效)
      const promptID = `msg_${randomUUID().replaceAll("-", "")}`
      // 新尝试从头流式, 旧尝试已发出的文本不回收
      state.streamed = ""
      state.pending = ""
      let admitted
      try {
        admitted = await v2.prompt({ sessionID, id: promptID, prompt: { text } })
      } catch (error) {
        log(`prompt 出错: ${error instanceof Error ? error.message : error}`)
        await reply(t("error"))
        return
      }
      log(`已递交 prompt attempt=${attempt} (${(admitted as { data?: { data?: { id?: string } } })?.data?.data?.id ?? "n/a"})`)

      const outcome = await waitIdle(v2, sessionID, state, log, notify, stream)
      if (state.abortedByUser) {
        log("被用户消息打断, 静默结束(通知已由新任务发出)")
        return
      }
      if (outcome === "timeout") {
        log(`看门狗超时 (${MODEL_TIMEOUT_MS / 1000}s), 打断并重试`)
        state.abortedByUser = true // 防止后续 wait 结果误判为"用户打断"
        await safeInterrupt(v2, sessionID)
        // 先把本轮已生成的文本冲给用户, 再提示超时
        await flushPending(state, stream, log)
        await reply(t("timeout", { n: attempt }))
        await sleep(1500)
        // 下轮重新 prompt 前先把标志清掉
        state.abortedByUser = false
        continue
      }

      const assistant = await lastAssistant(v2, sessionID)
      if (assistant && !assistant.error) {
        const finalText = assistantText(assistant)
        if (finalText) {
          // 先把未冲掉的流式缓冲发出去, 剩余部分(若有)用最终回复补齐
          await flushPending(state, stream, log)
          const remaining = finalText.slice(state.streamed.length)
          if (remaining) await reply(remaining)
          log(`✅ 已回复 (${finalText.length} 字, 流式 ${Math.min(state.streamed.length, finalText.length)} 字)`)
          return
        }
        await reply(t("noReply"))
        return
      }

      // 失败分类
      const errorName = assistant?.error?.name
      if (errorName === "MessageAbortedError") {
        await reply(t("interrupted", { what: state.info || t("thinking") }))
        return
      }
      log(`模型出错 (${errorName ?? "unknown"}), 重试 ${attempt}/${MAX_ATTEMPTS}`)
      await reply(t("timeout", { n: attempt }))
      await sleep(1000)
    }
    await reply(t("failed3"))
  } catch (error) {
    log(`处理失败: ${error instanceof Error ? error.message : error}`)
    await reply(t("error"))
  } finally {
    runState.delete(sessionID)
  }
}
