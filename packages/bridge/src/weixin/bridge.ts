import { chunkText, getUpdates, sendText, sendTyping, type WeixinMessage } from "./client"
import { readState, writeState } from "./state"
import { installAutoStart, isAutoStartInstalled, removeAutoStart } from "./daemon"

export type BridgeOptions = {
  serverUrl: string
  dir: string
  log: (msg: string) => string | void
}

type BridgeClient = {
  client: {
    session: {
      create(input: { directory?: string }): Promise<{ error?: unknown; data?: { id?: string } }>
      prompt(input: { sessionID: string; directory?: string; parts: Array<{ type: "text"; text: string }> }): Promise<unknown>
      messages(input: { sessionID: string; directory?: string }): Promise<{
        data?: Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>
      }>
    }
  }
}

async function makeClient(serverUrl: string): Promise<BridgeClient> {
  const { createOpencodeClient } = await import("@opencode-ai/sdk/v2")
  const client = createOpencodeClient({ baseUrl: serverUrl }) as unknown as { session: unknown }
  return { client } as unknown as BridgeClient
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function lastAssistantText(sdk: BridgeClient, sessionID: string, dir: string): Promise<string | undefined> {
  const res = await sdk.client.session.messages({ sessionID, directory: dir })
  const rows = (res.data ?? []) as Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>
  for (const row of [...rows].reverse()) {
    if (row.info?.role !== "assistant") continue
    const text = (row.parts ?? [])
      .map((p) => (p.type === "text" ? p.text : undefined))
      .filter((t): t is string => Boolean(t))
      .join("\n\n")
    if (text) return text
  }
  return undefined
}

const processing = new Set<string>()

export async function runWeixinBridge(opts: BridgeOptions): Promise<void> {
  const state = readState()
  const cred = state.credential
  if (!cred) throw new Error("未登录: 请先运行 lychee weixin login")
  const sdk = await makeClient(opts.serverUrl)
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
  sdk: BridgeClient
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

  // 会话映射: 每个微信用户一个 opencode 会话
  state.sessions = state.sessions ?? {}
  let sessionID = state.sessions[userKey]
  if (!sessionID) {
    const res = await sdk.client.session.create({ directory: opts.dir })
    if (!res.data?.id) {
      await sendText({ token, baseUrl, toUserId: msg.from_user_id!, contextToken: msg.context_token!, text: "⚠️ 创建会话失败, 请稍后再试。" })
      return
    }
    sessionID = res.data.id
    state.sessions[userKey] = sessionID
    writeState(state)
  }

  // 聊天命令(仅扫码登录账号可用)
  const command = text.trim().toLowerCase()
  const owner = msg.from_user_id === ownerUserId
  if (command === "/autostart" || command === "/autostop") {
    if (!owner) {
      await sendText({ token, baseUrl, toUserId: msg.from_user_id!, contextToken: msg.context_token!, text: "🔒 只有扫码登录的账号才能操作哦" })
      return
    }
    if (command === "/autostart") {
      const result = isAutoStartInstalled()
        ? { ok: true, message: "后台常驻已是开启状态(重启无影响)" }
        : installAutoStart(state.workDir ?? opts.dir)
      await sendText({ token, baseUrl, toUserId: msg.from_user_id!, contextToken: msg.context_token!, text: result.ok ? `✅ ${result.message}` : `⚠️ ${result.message}` })
    } else {
      const result = removeAutoStart()
      await sendText({ token, baseUrl, toUserId: msg.from_user_id!, contextToken: msg.context_token!, text: result.ok ? `✅ ${result.message}` : `⚠️ ${result.message}` })
    }
    opts.log(`聊天命令 ${command} 执行 (${owner ? "owner" : "非 owner 已拒绝"})`)
    return
  }

  if (processing.has(userKey)) {
    await sendText({ token, baseUrl, toUserId: msg.from_user_id!, contextToken: msg.context_token!, text: "⏳ 上一条消息还在处理中, 完成后再回复你~" })
    return
  }
  processing.add(userKey)
  opts.log(`🤖 正在处理 ${msg.from_user_id}: ${text.slice(0, 20)}…`)
  await sendTyping({ token, baseUrl, userId: msg.from_user_id!, contextToken: msg.context_token, status: 1 })
  try {
    const promptRes = await sdk.client.session.prompt({
      sessionID,
      directory: opts.dir,
      parts: [{ type: "text", text }],
    })
    if ((promptRes as { error?: unknown }).error) throw new Error("prompt 失败")
    const reply = await lastAssistantText(sdk, sessionID, opts.dir)
    if (!reply) {
      await sendText({ token, baseUrl, toUserId: msg.from_user_id!, contextToken: msg.context_token!, text: "😅 没有拿到回复, 请稍后再试一次吧~" })
    } else {
      const chunks = chunkText(reply)
      for (let i = 0; i < chunks.length; i++) {
        const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : ""
        await sendText({ token, baseUrl, toUserId: msg.from_user_id!, contextToken: msg.context_token!, text: prefix + chunks[i] })
      }
      opts.log(`✅ 已回复 ${msg.from_user_id} (${reply.length} 字, ${chunks.length} 段)`)
    }
  } catch (error) {
    opts.log(`处理失败: ${error instanceof Error ? error.message : error}`)
    await sendText({
      token,
      baseUrl,
      toUserId: msg.from_user_id!,
      contextToken: msg.context_token!,
      text: "😅 哎呀, 处理出错了, 请稍后再试~",
    })
  } finally {
    processing.delete(userKey)
    await sendTyping({ token, baseUrl, userId: msg.from_user_id!, contextToken: msg.context_token, status: 2 })
  }
}
