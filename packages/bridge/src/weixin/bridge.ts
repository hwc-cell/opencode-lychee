import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { chunkText, getUpdates, sendText, sendTyping, type WeixinMessage } from "./client"
import { readState, writeState } from "./state"
import { handleChatCommand } from "../commands"
import { deliverMessage, enqueue, interruptCurrent, isQueued, type BotSdk } from "../bot"
import { t } from "../i18n"

export type BridgeOptions = {
  serverUrl: string
  dir: string
  log: (msg: string) => string | void
}

// OpencodeClient 的 .client 受保护, 通过结构接口桥接(SDK v2 均在运行时存在)。
// 更新 SDK 生成代码后, BotSdk 里新增的方法需同步加入。
const makeClient = (serverUrl: string): BotSdk =>
  ({ client: createOpencodeClient({ baseUrl: serverUrl }) }) as unknown as BotSdk

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runWeixinBridge(opts: BridgeOptions): Promise<void> {
  const state = readState()
  const cred = state.credential
  if (!cred) throw new Error("未登录: 请先运行 lychee weixin login")
  const sdk = makeClient(opts.serverUrl)
  let running = true
  process.on("SIGINT", () => {
    running = false
  })

  let cursor = state.cursor ?? ""
  opts.log(`微信 Bot 已启动 (${cred.accountId}), 等待消息… (Ctrl+C 停止)`)

  while (running) {
    let resp
    try {
      resp = await getUpdates({ token: cred.token, baseUrl: cred.baseUrl, cursor })
    } catch (error) {
      opts.log(`轮询失败: ${error instanceof Error ? error.message : error} — 2s 后重试`)
      await sleep(2000)
      continue
    }
    if (resp.ret === -14) {
      opts.log("⚠️ 微信会话已过期(-14), 请重新扫码: lychee weixin login")
      writeState({})
      return
    }
    if (resp.ret !== 0) {
      opts.log(`getupdates ret=${resp.ret}, 30s 后重试`)
      await sleep(30000)
      continue
    }
    if (resp.get_updates_buf && resp.get_updates_buf !== cursor) {
      cursor = resp.get_updates_buf
      state.cursor = cursor
      writeState(state)
    }
    for (const msg of resp.msgs ?? []) {
      if (msg.message_type !== 1) continue // 只处理用户消息
      const text = msg.item_list?.find((item) => item.type === 1)?.text_item?.text
      if (text) opts.log(`📩 收到 ${msg.from_user_id}: ${text.slice(0, 40)}`)
      if (!text || !msg.from_user_id || !msg.context_token) continue
      await handleMessage({ opts, sdk, token: cred.token, baseUrl: cred.baseUrl, accountId: cred.accountId, ownerUserId: cred.userId, msg, text })
    }
  }
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
  text: string
}) {
  const { opts, sdk, token, baseUrl, accountId, ownerUserId, msg, text } = args
  const userKey = `${accountId}#${msg.from_user_id}`
  const state = readState()

  // 缓存会话上下文令牌
  state.contexts = state.contexts ?? {}
  state.contexts[userKey] = msg.context_token!
  writeState(state)

  const reply = (replyText: string) =>
    sendText({ token, baseUrl, toUserId: msg.from_user_id!, contextToken: msg.context_token!, text: replyText })

  // 会话映射: 每个微信用户一个 opencode 会话
  state.sessions = state.sessions ?? {}
  let sessionID = state.sessions[userKey]
  if (!sessionID) {
    const res = (await sdk.v2.session.create({ location: { directory: opts.dir } })) as {
      data?: { data?: { id?: string } }
    }
    const id = res.data?.data?.id
    if (!id) {
      await reply(t("noSession"))
      return
    }
    sessionID = id
    state.sessions[userKey] = sessionID
    writeState(state)
    await reply(t("created"))
  }

  // 聊天指令(通道无关核心, 仅 owner 可操作后台常驻)
  if (
    await handleChatCommand({
      channel: "weixin",
      text,
      fromUserId: msg.from_user_id!,
      ownerUserId,
      workDir: state.workDir ?? opts.dir,
      reply,
      log: (m) => opts.log(m),
    })
  ) {
    return
  }

  // 新消息打断正在运行的旧任务(通知由核心发出)
  if (isQueued(userKey)) {
    await interruptCurrent({ sdk, sessionID, reply, log: (m) => opts.log(m) })
  }

  // 同一用户串行处理: 新消息在旧任务结束后执行
  await enqueue(userKey, async () => {
    await sendTyping({ token, baseUrl, userId: msg.from_user_id!, contextToken: msg.context_token, status: 1 })
    try {
      await deliverMessage({
        sdk,
        sessionID,
        text,
        reply: async (replyText) => {
          const chunks = chunkText(replyText)
          for (let i = 0; i < chunks.length; i++) {
            const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : ""
            await sendText({ token, baseUrl, toUserId: msg.from_user_id!, contextToken: msg.context_token!, text: prefix + chunks[i] })
          }
        },
        log: (m) => opts.log(m),
      })
    } finally {
      await sendTyping({ token, baseUrl, userId: msg.from_user_id!, contextToken: msg.context_token, status: 2 })
    }
  })
}
