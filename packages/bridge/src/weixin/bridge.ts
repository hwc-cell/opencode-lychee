import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { randomUUID } from "node:crypto"
import { chunkText, getUpdates, messageText, sendText, sendTyping, type WeixinMessage } from "./client"
import { readState, updateState } from "./state"
import { handleChatCommand } from "../commands"
import { deliverMessage, enqueue, interruptAll, interruptCurrent, isQueued, type BotSdk, type BridgeModelInfo, type BridgeModelRef } from "../bot"
import { t } from "../i18n"

export type BridgeOptions = {
  serverUrl: string
  dir: string
  log: (msg: string) => string | void
}

// OpencodeClient 的 .client 受保护, 通过结构接口桥接(SDK v2 均在运行时存在)。
// 更新 SDK 生成代码后, BotSdk 里新增的方法需同步加入。
const makeClient = (serverUrl: string): BotSdk =>
  createOpencodeClient({ baseUrl: serverUrl }) as unknown as BotSdk

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Session = { id: string; created: boolean }
type SessionFn = (key: string, model?: BridgeModelRef) => Promise<Session | undefined>

function health(status: NonNullable<ReturnType<typeof readState>["health"]>["status"], error?: string) {
  const now = new Date().toISOString()
  updateState((state) => {
    state.health = {
      ...state.health,
      status,
      pid: status === "stopped" || status === "expired" ? undefined : process.pid,
      updatedAt: now,
      startedAt: status === "starting" ? now : (state.health?.startedAt ?? now),
      lastError: error,
    }
  })
}

export async function runWeixinBridge(opts: BridgeOptions): Promise<void> {
  const state = readState()
  const cred = state.credential
  if (!cred) throw new Error("未登录: 请先运行 OpenCode-Lychee weixin login")
  const sdk = makeClient(opts.serverUrl)
  const pending = new Map<string, Promise<Session | undefined>>()
  const checked = new Set<string>()
  const session: SessionFn = (key, model) => {
    const active = pending.get(key)
    if (active) return active.then((value) => (value ? { ...value, created: false } : value))
    const task = (async () => {
      const stored = readState().sessions?.[key]
      if (stored && checked.has(stored)) return { id: stored, created: false }
      if (stored) {
        const valid = await sdk.v2.session.messages({ sessionID: stored, limit: 1, order: "desc" }, { throwOnError: true }).then(
          () => true,
          () => false,
        )
        if (valid) {
          checked.add(stored)
          return { id: stored, created: false }
        }
        updateState((next) => {
          if (next.sessions?.[key] === stored) delete next.sessions[key]
        })
        opts.log(`旧会话已失效, 正在为 ${key} 自动重建`)
      }
      const res = (await sdk.v2.session.create({ location: { directory: opts.dir }, model }, { throwOnError: true })) as {
        data?: { data?: { id?: string } }
      }
      const id = res.data?.data?.id
      if (!id) return undefined
      checked.add(id)
      updateState((next) => {
        if (next.credential?.token !== cred.token) return
        next.sessions = next.sessions ?? {}
        next.sessions[key] = id
      })
      return { id, created: true }
    })().catch((error) => {
      opts.log(`会话准备失败 (${key}): ${error instanceof Error ? error.message : error}`)
      return undefined
    })
    pending.set(key, task)
    const clear = () => {
      if (pending.get(key) === task) pending.delete(key)
    }
    void task.then(clear, clear)
    return task
  }
  let running = true
  const abort = new AbortController()
  const stop = () => {
    running = false
    abort.abort()
    void interruptAll(sdk)
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  health("starting")

  let cursor = state.cursor ?? ""
  let timeout = 45_000
  // getupdates 可能重复推送, 按消息 id 去重
  const processed = new Set<string>()
  opts.log(`微信 Bot 已启动 (${cred.accountId}), 等待消息… (Ctrl+C 停止)`)

  while (running) {
    if (readState().credential?.token !== cred.token) {
      opts.log("检测到登录凭证已更新, 当前桥即将退出并由后台服务重新加载")
      break
    }
    let resp
    try {
      resp = await getUpdates({ token: cred.token, baseUrl: cred.baseUrl, cursor, timeoutMs: timeout, signal: abort.signal })
    } catch (error) {
      if (!running) break
      if (readState().credential?.token !== cred.token) break
      const message = error instanceof Error ? error.message : String(error)
      health("offline", message)
      opts.log(`轮询失败: ${message} — 2s 后重试`)
      await sleep(2000)
      continue
    }
    if (readState().credential?.token !== cred.token) break
    if (resp.ret === -14) {
      updateState((next) => {
        next.cursor = ""
        next.contexts = {}
      })
      health("expired", "微信登录已失效(-14), 请重新扫码")
      opts.log("⚠️ 微信登录已失效(-14), 已停止轮询; 请运行 OpenCode-Lychee weixin login 重新扫码")
      break
    }
    if (resp.ret !== 0) {
      health("offline", `getupdates ret=${resp.ret}`)
      opts.log(`getupdates ret=${resp.ret}, 30s 后重试`)
      await sleep(30000)
      continue
    }
    health("online")
    if (resp.longpolling_timeout_ms) timeout = resp.longpolling_timeout_ms + 10_000
    if (resp.get_updates_buf && resp.get_updates_buf !== cursor) {
      cursor = resp.get_updates_buf
      updateState((next) => {
        if (next.credential?.token !== cred.token) return
        next.cursor = cursor
      })
    }
    for (const msg of resp.msgs ?? []) {
      if (msg.message_type !== 1) continue // 只处理用户消息
      const msgKey = String(msg.message_id ?? msg.seq ?? "")
      if (msgKey && processed.has(msgKey)) continue
      if (msgKey) {
        processed.add(msgKey)
        if (processed.size > 2000) processed.delete(processed.values().next().value!)
      }
      const text = messageText(msg)
      if (text) opts.log(`📩 收到 ${msg.from_user_id}: ${text.slice(0, 40)}`)
      if (!msg.from_user_id || !msg.context_token) continue
      updateState((next) => {
        if (next.credential?.token !== cred.token) return
        const now = new Date().toISOString()
        next.contexts = next.contexts ?? {}
        next.contexts[`${cred.accountId}#${msg.from_user_id}`] = msg.context_token!
        if (next.health) {
          next.health.updatedAt = now
          next.health.lastInboundAt = now
        }
      })
      void handleMessage({
        opts,
        sdk,
        token: cred.token,
        baseUrl: cred.baseUrl,
        accountId: cred.accountId,
        ownerUserId: cred.userId,
        msg,
        text,
        session,
      }).catch((error) => {
        opts.log(`消息处理失败: ${error instanceof Error ? error.message : error}`)
      })
    }
  }
  await interruptAll(sdk)
  process.off("SIGINT", stop)
  process.off("SIGTERM", stop)
  const last = readState().health
  if (last?.status !== "expired" && last?.pid === process.pid) health("stopped")
  opts.log("桥已停止")
}

async function handleMessage(args: {
  opts: BridgeOptions
  sdk: BotSdk
  token: string
  baseUrl: string
  accountId: string
  ownerUserId: string
  msg: WeixinMessage
  text?: string
  session: SessionFn
}) {
  const { opts, sdk, token, baseUrl, accountId, ownerUserId, msg, text, session } = args
  const userKey = `${accountId}#${msg.from_user_id}`
  const state = readState()

  // 入站 context_token 是当前对话的回复路由锚点; getconfig 只返回 typing_ticket, 不会刷新它。
  const ctxToken = msg.context_token!
  const reply = async (replyText: string) => {
    const clientId = `lychee-weixin:${Date.now()}-${randomUUID()}`
    for (let i = 0; i < 2; i++) {
      try {
        await sendText({ token, baseUrl, toUserId: msg.from_user_id!, contextToken: ctxToken, text: replyText, clientId })
        updateState((next) => {
          if (next.health) {
            next.health.updatedAt = new Date().toISOString()
            next.health.lastOutboundAt = next.health.updatedAt
          }
        })
        return
      } catch (error) {
        opts.log(`发送失败(第${i + 1}次): ${error instanceof Error ? error.message : error}`)
        if (i === 1) throw error
      }
    }
  }

  if (!text) {
    await reply(t("unsupported"))
    return
  }

  // 用户的模型选择(微信里 /model 切换并持久化), 默认 muse 免费模型
  state.models = state.models ?? {}
  const [defaultProvider, defaultID] = (process.env.LYCHEE_MODEL ?? "opencode/muse-spark-1.3-contributor-free").split("/")
  const defaultModel = defaultID ? { id: defaultID, providerID: defaultProvider } : undefined
  const model = state.models[userKey] ?? state.model ?? defaultModel

  // 聊天指令优先处理; /help、/autostart 等不再创建无用 AI 会话。
  if (
    await handleChatCommand({
      channel: "weixin",
      text,
      fromUserId: msg.from_user_id!,
      ownerUserId,
      workDir: state.workDir ?? opts.dir,
      reply,
      log: (m) => opts.log(m),
      models: {
        list: async () => {
          const res = (await sdk.v2.model.list({ location: { directory: opts.dir } })) as {
            data?: { data?: BridgeModelInfo[] }
          }
          return res.data?.data ?? []
        },
        switchModel: async (next) => {
          const ready = await session(userKey, next)
          if (!ready) return false
          try {
            await sdk.v2.session.switchModel({ sessionID: ready.id, model: next }, { throwOnError: true })
            updateState((current) => {
              if (current.credential?.token !== token) return
              current.models = current.models ?? {}
              current.models[userKey] = next
            })
            return true
          } catch (error) {
            opts.log(`/model 切换失败: ${error instanceof Error ? error.message : error}`)
            return false
          }
        },
      },
    })
  ) {
    return
  }

  // 未配置模型的用户: 引导配置(指令如 /model 已在上方放行)
  if (!state.models[userKey] && !state.model) {
    await reply(t("needModelConfig"))
    return
  }

  const ready = await session(userKey, model)
  if (!ready) {
    await reply(t("noSession"))
    return
  }
  const sessionID = ready.id

  // 新消息打断正在运行的旧任务(通知由核心发出)
  if (isQueued(userKey)) {
    await interruptCurrent({ sdk, sessionID, reply, log: (m) => opts.log(m) })
  }

  // 同一用户串行处理: 新消息在旧任务结束后执行
  await enqueue(userKey, async () => {
    if (ready.created) await reply(t("created"))
    await sendTyping({ token, baseUrl, userId: msg.from_user_id!, contextToken: msg.context_token, status: 1 })
    try {
      await deliverMessage({
        sdk,
        sessionID,
        text,
        model,
        reply: async (replyText) => {
          const chunks = chunkText(replyText, 1990)
          for (let i = 0; i < chunks.length; i++) {
            const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : ""
            await reply(prefix + chunks[i])
          }
        },
        log: (m) => opts.log(m),
      })
    } finally {
      await sendTyping({ token, baseUrl, userId: msg.from_user_id!, contextToken: msg.context_token, status: 2 })
    }
  })
}
