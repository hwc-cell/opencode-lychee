import { randomUUID } from "node:crypto"
import { t } from "./i18n"

// 通道无关的聊天代理核心: 处理"发消息给 AI -> 等待 -> 回复"全过程。
// 微信/Slack/Telegram/飞书 适配器共用, 自动获得:
//   - 运行中打断通知(⚡️已打断,当前运行:XXX)
//   - 网络抖动安全重连, 不会重复执行可能包含工具调用的整轮消息
//   - 按用户串行排队, 新消息打断旧任务后立即接管

export type BridgeModelInfo = {
  id: string
  providerID: string
  name?: string
  enabled?: boolean
  variants?: Array<{ id: string }>
}

export type BridgeModelRef = { id: string; providerID: string; variant?: string }
export type BridgeFile = { uri: string; mime: string; name?: string }
type SdkOptions = { throwOnError?: boolean; signal?: AbortSignal }

export type BotSdk = {
  v2: {
    model: {
      list(
        parameters?: { location?: { directory?: string; workspace?: string } },
        options?: SdkOptions,
      ): Promise<unknown>
    }
    session: {
      create(
        parameters?: {
          id?: string
          agent?: string
          role?: string
          model?: { id: string; providerID: string; variant?: string }
          location?: { directory?: string; workspace?: string }
        },
        options?: SdkOptions,
      ): Promise<unknown>
      prompt(
        parameters: {
          sessionID: string
          id?: string
          prompt?: { text: string; files?: BridgeFile[] }
          delivery?: "steer" | "queue"
        },
        options?: SdkOptions,
      ): Promise<unknown>
      switchModel(parameters: { sessionID: string; model: BridgeModelRef }, options?: SdkOptions): Promise<unknown>
      wait(parameters: { sessionID: string }, options?: SdkOptions): Promise<unknown>
      interrupt(parameters: { sessionID: string }, options?: SdkOptions): Promise<unknown>
      messages(
        parameters: { sessionID: string; limit?: number; order?: "asc" | "desc"; cursor?: string },
        options?: SdkOptions,
      ): Promise<unknown>
    }
  }
}

export type DeliverArgs = {
  sdk: BotSdk
  sessionID: string
  text: string
  files?: BridgeFile[]
  promptID?: string
  model?: BridgeModelRef
  reply: (text: string) => Promise<void>
  notify?: (text: string) => Promise<void>
  stream?: (text: string) => Promise<void>
  log: (msg: string) => void
  poll?: () => Promise<void>
  cancelled?: () => boolean
}

// 每次尝试的最长等待(看门狗), 超时视为模型超时; 可用 LYCHEE_MODEL_TIMEOUT_MS 覆盖
const MODEL_TIMEOUT_MS = Number(process.env.LYCHEE_MODEL_TIMEOUT_MS ?? 600_000)
// 运行中提醒间隔(默认 5 分钟); 可用 LYCHEE_WORK_REMINDER_MS 覆盖
const WORK_REMINDER_MS = Number(process.env.LYCHEE_WORK_REMINDER_MS ?? 300_000)
// 流式转发的最小发文字数: 每轮轮询(2s)攒够就发一条增量, 用户可实时看到模型打字
// 微信等无"编辑消息"能力的渠道只能分片: 默认攒 80 字, 避免产生大量零碎气泡
const MIN_STREAM_LEN = Number(process.env.LYCHEE_STREAM_MIN_CHARS ?? 80)
const PROMPT_ADMISSION_ATTEMPTS = 3
const WAIT_RECONNECT_DELAY_MS = 500
const WAIT_RECONNECT_MAX_MS = 10_000

type RunState = {
  running: boolean
  info: string
  tool?: string
  abortedByUser: boolean
  streamed: string
  pending: string
  polling: boolean
  pollTask?: Promise<void>
  rewritten: boolean
}

const runState = new Map<string, RunState>()
const queues = new Map<string, Promise<void>>()
const queueVersions = new Map<string, number>()

// 每个 key 串行执行任务; 已在队列中时新任务会排在旧任务之后
export function enqueue<T>(key: string, task: (cancelled: () => boolean) => Promise<T>): Promise<T | undefined> {
  const prev = queues.get(key) ?? Promise.resolve()
  const version = queueVersions.get(key) ?? 0
  const run = prev
    .catch(() => {})
    .then(() => {
      if ((queueVersions.get(key) ?? 0) !== version) return
      return task(() => (queueVersions.get(key) ?? 0) !== version)
    })
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  queues.set(key, tail)
  void tail.then(() => {
    if (queues.get(key) === tail) {
      queues.delete(key)
      queueVersions.delete(key)
    }
  })
  return run
}

export function isQueued(key: string): boolean {
  return queues.has(key)
}

export function cancelQueued(key: string): boolean {
  if (!isQueued(key)) return false
  queueVersions.set(key, (queueVersions.get(key) ?? 0) + 1)
  return true
}

export function isSessionRunning(sessionID: string): boolean {
  return runState.get(sessionID)?.running ?? false
}

type V2Session = BotSdk["v2"]["session"]

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function safeInterrupt(v2: V2Session, sessionID: string) {
  try {
    await v2.interrupt({ sessionID }, { throwOnError: true })
  } catch (error) {
    // interrupt 是尽力而为; 失败时等 server 自己停
  }
}

export async function interruptAll(sdk: BotSdk): Promise<void> {
  const active = [...runState.entries()].filter(([, state]) => state.running)
  active.forEach(([, state]) => {
    state.abortedByUser = true
  })
  await Promise.all(active.map(([sessionID]) => safeInterrupt(sdk.v2.session, sessionID)))
}

type AssistantMessage = {
  id?: string
  type?: string
  error?: { name?: string; type?: string }
  content?: Array<{ type?: string; text?: string; name?: string; state?: { status?: string } }>
}

function rowsOf(res: unknown): AssistantMessage[] {
  const payload = res as { data?: { data?: AssistantMessage[] } | AssistantMessage[] }
  const inner = payload.data as { data?: AssistantMessage[] } | AssistantMessage[] | undefined
  if (Array.isArray(inner)) return inner
  return inner?.data ?? []
}

// Only messages after this exact admitted input belong to its reply. Multiple v2
// model steps are separate assistant messages, not revisions of one text blob.
export async function readTurnResponse(v2: V2Session, sessionID: string, promptID: string) {
  const messages: AssistantMessage[] = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const response = await v2.messages(
      { sessionID, limit: 50, ...(cursor ? { cursor } : { order: "desc" as const }) },
      { throwOnError: true },
    )
    const rows = rowsOf(response)
    const boundary = rows.findIndex((row) => row.id === promptID)
    messages.push(...(boundary < 0 ? rows : rows.slice(0, boundary)))
    if (boundary >= 0) {
      const ordered = messages.reverse()
      const nextInput = ordered.findIndex((row) => row.type === "user")
      const assistants = (nextInput < 0 ? ordered : ordered.slice(0, nextInput)).filter(
        (row) => row.type === "assistant",
      )
      const latest = assistants.at(-1)
      const tool = latest?.content?.find(
        (part) => part.type === "tool" && part.state?.status !== "completed" && part.state?.status !== "error",
      )?.name
      return {
        text: assistants.map(assistantText).filter(Boolean).join("\n\n"),
        error: latest?.error,
        tool,
      }
    }
    // SAFETY: BotSdk's adapter preserves the generated message-list cursor envelope.
    const next = (response as { data?: { cursor?: { next?: string } } }).data?.cursor?.next
    if (!rows.length || !next || next === cursor) return { text: "" }
    cursor = next
  }
  throw new Error(t("replyTooLong"))
}

async function readReply(v2: V2Session, sessionID: string, promptID: string, log: (msg: string) => void) {
  let failure: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await readTurnResponse(v2, sessionID, promptID)
    } catch (error) {
      failure = error
      log(`读取回复失败 (${attempt}/3): ${error instanceof Error ? error.message : error}`)
      if (attempt < 3) await sleep(WAIT_RECONNECT_DELAY_MS)
    }
  }
  throw failure
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
  try {
    await stream(chunk)
  } catch (error) {
    state.pending = chunk + state.pending
    throw error
  }
  log(`📤 流式已发 (${chunk.length} 字)`)
}

// 轮询一次: 更新"当前运行"信息 + 流式转发模型已生成的新文本
async function poll(
  v2: V2Session,
  sessionID: string,
  promptID: string,
  state: RunState,
  stream: (text: string) => Promise<void>,
  log: (msg: string) => void,
) {
  if (state.polling) return
  state.polling = true
  try {
    const response = await readTurnResponse(v2, sessionID, promptID)
    if (state.abortedByUser) return
    // 运行状态
    if (response.tool) {
      state.tool = response.tool
      state.info = t("runningTool", { tool: response.tool })
    } else {
      state.tool = undefined
      const text = response.text
      if (text) {
        const compact = text.replaceAll(/\s+/g, " ").trim().slice(-60)
        if (compact) state.info = compact
      }
    }
    if (response.error || state.rewritten) return
    const full = response.text
    if (!full.startsWith(state.streamed)) {
      state.rewritten = true
      return
    }
    const newPart = full.slice(state.streamed.length)
    if (newPart) {
      state.streamed = full
      state.pending += newPart
    }
    if (state.pending.length >= MIN_STREAM_LEN) await flushPending(state, stream, log)
  } catch (error) {
    log(`轮询失败: ${error instanceof Error ? error.message : error}`)
  } finally {
    state.polling = false
  }
}

// 等待会话变 idle; 每 2s 轮询(状态 + 流式)并定期发工作提醒, 看门狗超时返回 "timeout"
async function waitIdle(
  v2: V2Session,
  sessionID: string,
  promptID: string,
  state: RunState,
  log: (msg: string) => void,
  notify: (text: string) => Promise<void>,
  stream: (text: string) => Promise<void>,
  pollExtra?: () => Promise<void>,
): Promise<"idle" | "timeout"> {
  const startedAt = Date.now()
  let lastReminder = startedAt
  const tick = () => {
    if (state.pollTask) return
    state.pollTask = (async () => {
      await poll(v2, sessionID, promptID, state, stream, log)
      if (!state.abortedByUser) await pollExtra?.()
      const elapsed = Date.now() - startedAt
      if (!state.abortedByUser && elapsed - (lastReminder - startedAt) >= WORK_REMINDER_MS) {
        lastReminder = Date.now()
        const mins = Math.max(1, Math.floor(elapsed / 60_000))
        await notify(
          t("stillWorking", { m: mins, extra: state.tool ? t("stillWorkingTool", { tool: state.tool }) : "" }),
        )
        log(`工作提醒: 已工作约 ${mins} 分钟${state.tool ? ` (${state.tool})` : ""}`)
      }
    })()
      .catch((error) => log(`状态刷新失败: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => {
        state.pollTask = undefined
      })
  }
  const timer = setInterval(tick, 2000)
  tick()
  const abort = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = startedAt + MODEL_TIMEOUT_MS
    const timedOut = new Promise<"timeout">((resolve) => {
      timeout = setTimeout(() => resolve("timeout"), MODEL_TIMEOUT_MS)
    })
    let reconnectAttempt = 0
    while (Date.now() < deadline) {
      try {
        return await Promise.race([
          v2.wait({ sessionID }, { throwOnError: true, signal: abort.signal }).then(() => "idle" as const),
          timedOut,
        ])
      } catch (error) {
        log(`wait 连接中断, 正在恢复: ${error instanceof Error ? error.message : error}`)
        reconnectAttempt++
        const delay = Math.min(WAIT_RECONNECT_DELAY_MS * 2 ** (reconnectAttempt - 1), WAIT_RECONNECT_MAX_MS)
        await sleep(Math.min(delay, Math.max(0, deadline - Date.now())))
      }
    }
    return "timeout"
  } finally {
    clearInterval(timer)
    clearTimeout(timeout)
    abort.abort()
    await state.pollTask
  }
}

// 用户在当前运行中又发了新消息: 打断并通知, 旧任务随后静默结束
export async function interruptCurrent(args: {
  sdk: BotSdk
  sessionID: string
  reply: (text: string) => Promise<void>
  log: (msg: string) => void
  notify?: boolean
}): Promise<boolean> {
  const state = runState.get(args.sessionID)
  if (!state?.running) return false
  state.abortedByUser = true
  await safeInterrupt(args.sdk.v2.session, args.sessionID)
  if (args.notify !== false) await args.reply(t("interrupted", { what: state.info || t("thinking") }))
  args.log(`已打断运行中的对话 (${args.sessionID})`)
  return true
}

export async function deliverMessage(args: DeliverArgs): Promise<void> {
  if (args.cancelled?.()) return
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

  const state: RunState = {
    running: true,
    info: t("thinking"),
    abortedByUser: false,
    streamed: "",
    pending: "",
    polling: false,
    rewritten: false,
  }
  runState.set(sessionID, state)
  // 钉死模型: session 级 model 不持久, 每次处理前切一次(失败不阻塞, 只用默认)
  if (args.model) {
    await v2.switchModel({ sessionID, model: args.model }, { throwOnError: true }).catch(() => {})
  }
  log(`🤖 开始处理 (${sessionID})`)
  try {
    await notify(t("started"))
    if (state.abortedByUser || args.cancelled?.()) return
    // admission 可能已在服务端成功、但响应在网络中丢失。所有重试复用同一个 ID，
    // 让 V2 exact-retry 去重，绝不能把可能包含工具调用的整轮对话重新执行。
    const promptID = args.promptID ?? `msg_${randomUUID().replaceAll("-", "")}`
    let admitted: unknown
    for (let attempt = 1; attempt <= PROMPT_ADMISSION_ATTEMPTS; attempt++) {
      if (state.abortedByUser || args.cancelled?.()) return
      try {
        admitted = await v2.prompt(
          { sessionID, id: promptID, prompt: { text, ...(args.files?.length ? { files: args.files } : {}) } },
          { throwOnError: true },
        )
        break
      } catch (error) {
        log(
          `prompt 递交失败 (${attempt}/${PROMPT_ADMISSION_ATTEMPTS}): ${error instanceof Error ? error.message : error}`,
        )
        if (attempt === PROMPT_ADMISSION_ATTEMPTS) {
          await reply(t("error"))
          return
        }
        await sleep(WAIT_RECONNECT_DELAY_MS)
      }
    }
    log(`已递交 prompt (${(admitted as { data?: { data?: { id?: string } } })?.data?.data?.id ?? "n/a"})`)

    if (state.abortedByUser || args.cancelled?.()) {
      await safeInterrupt(v2, sessionID)
      return
    }

    const outcome = await waitIdle(v2, sessionID, promptID, state, log, notify, stream, args.poll)
    if (state.abortedByUser) {
      log("被用户消息打断, 静默结束(通知已由新任务发出)")
      return
    }
    if (outcome === "timeout") {
      log(`看门狗超时 (${MODEL_TIMEOUT_MS / 1000}s), 已停止本轮且不自动重投`)
      state.abortedByUser = true
      await safeInterrupt(v2, sessionID)
      await flushPending(state, stream, log)
      await reply(t("timedOut"))
      return
    }

    const response = await readReply(v2, sessionID, promptID, log)
    if (state.abortedByUser || args.cancelled?.()) return
    if (response && !response.error) {
      const finalText = response.text
      if (finalText) {
        if (state.rewritten || !finalText.startsWith(state.streamed)) {
          state.pending = ""
          await reply(t("replyRevised") + "\n\n" + finalText)
          return
        }
        await flushPending(state, stream, log)
        const remaining = finalText.slice(state.streamed.length)
        if (remaining) await reply(remaining)
        log(`✅ 已回复 (${finalText.length} 字, 流式 ${Math.min(state.streamed.length, finalText.length)} 字)`)
        return
      }
      await reply(t("noReply"))
      return
    }

    const errorName = response?.error?.type ?? response?.error?.name
    if (errorName === "MessageAbortedError" || errorName === "session.interrupted") {
      await reply(t("interrupted", { what: state.info || t("thinking") }))
      return
    }
    log(`模型出错 (${errorName ?? "unknown"}), 服务端重试已结束, 不再重复提交用户消息`)
    await reply(t("error"))
  } catch (error) {
    if (state.abortedByUser || args.cancelled?.()) return
    log(`处理失败: ${error instanceof Error ? error.message : error}`)
    await reply(t("error"))
  } finally {
    if (runState.get(sessionID) === state) runState.delete(sessionID)
  }
}
