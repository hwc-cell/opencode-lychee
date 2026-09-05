// 微信 iLink Bot API 客户端(仅文本; 媒体见协议文档 §8, v2 实现)
import { randomBytes } from "node:crypto"

const DEFAULT_BASE = "https://ilinkai.weixin.qq.com"
// iLink 协议版本(2.1.1 编码为 0x00MMNNPP 整数, 服务端按此识别客户端)
const ILINK_APP_CLIENT_VERSION = 131329

function randomWechatUin(): string {
  const value = randomBytes(4).readUInt32BE(0)
  return Buffer.from(String(value), "utf8").toString("base64")
}

function baseHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    Authorization: `Bearer ${token}`,
    "X-WECHAT-UIN": randomWechatUin(),
    "iLink-App-Id": "bot",
    "iLink-App-ClientVersion": String(ILINK_APP_CLIENT_VERSION),
  }
}

function baseInfo() {
  return { channel_version: "2.1.1" }
}

// ---------- 登录 ----------
export type QrStage =
  | { status: "wait" }
  | { status: "scaned" }
  | { status: "scaned_but_redirect"; redirect_host?: string }
  | { status: "expired" }
  | {
      status: "confirmed"
      bot_token: string
      ilink_bot_id: string
      ilink_user_id: string
      baseurl?: string
    }

export async function getQr(): Promise<{ qrcode: string; qrcode_img_content: string }> {
  const res = await fetch(`${DEFAULT_BASE}/ilink/bot/get_bot_qrcode?bot_type=3`, {
    headers: { SKRouteTag: "1001" },
  })
  if (!res.ok) throw new Error(`获取二维码失败: HTTP ${res.status}`)
  const json = (await res.json()) as { qrcode?: string; qrcode_img_content?: string }
  if (!json.qrcode || !json.qrcode_img_content) throw new Error(`二维码响应异常: ${JSON.stringify(json).slice(0, 200)}`)
  return { qrcode: json.qrcode, qrcode_img_content: json.qrcode_img_content }
}

// 接口是 ~30s 长轮询: 45s 超时兜底, 与真机行为对齐
export async function pollQr(qrcode: string, baseUrl = DEFAULT_BASE, signal?: AbortSignal): Promise<QrStage> {
  const timeout = AbortSignal.timeout(45_000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const res = await fetch(`${baseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, {
    headers: {
      ...baseHeaders(""),
      "iLink-App-ClientVersion": String(ILINK_APP_CLIENT_VERSION),
    },
    signal: combined,
  })
  if (!res.ok) throw new Error(`轮询二维码失败: HTTP ${res.status}`)
  return (await res.json()) as QrStage
}

/** 长轮询扫码状态直到 confirmed / expired; onStage 用于打印进度 */
export async function loginUntilConfirmed(opts: {
  onStage?: (stage: QrStage) => void
  onQr?: (qr: { qrcode: string; qrcode_img_content: string }) => void
  signal?: AbortSignal
}): Promise<{ token: string; botId: string; userId: string; baseUrl: string }> {
  let qr = await getQr()
  opts.onQr?.(qr)
  let baseUrl = DEFAULT_BASE
  let refreshCount = 0
  for (;;) {
    try {
      const stage = await pollQr(qr.qrcode, baseUrl, opts.signal)
      if (stage.status === "confirmed") {
        return {
          token: stage.bot_token,
          botId: stage.ilink_bot_id,
          userId: stage.ilink_user_id,
          baseUrl: stage.baseurl ?? DEFAULT_BASE,
        }
      }
      if (stage.status === "expired") {
        // 二维码 150s 过期: 自动换新码继续等(最多 3 次)
        refreshCount += 1
        if (refreshCount > 3) throw new Error("二维码连续过期, 请重新运行 lychee weixin login")
        qr = await getQr()
        baseUrl = DEFAULT_BASE
        opts.onQr?.(qr)
        opts.onStage?.({ status: "wait" })
        continue
      }
      if (stage.status === "scaned_but_redirect" && stage.redirect_host) {
        const host = stage.redirect_host.includes("://") ? stage.redirect_host : `https://${stage.redirect_host}`
        if (host !== baseUrl) {
          baseUrl = host
          opts.onStage?.({ status: "wait" })
        }
        continue
      }
      opts.onStage?.(stage)
    } catch (error) {
      if (opts.signal?.aborted) throw error
      // 轮询超时/网络抖动: 重试(服务端 ~30s 一轮)
      opts.onStage?.({ status: "wait" } as QrStage)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

// ---------- 业务 ----------
export type WeixinMessage = {
  seq?: number
  message_id?: number
  from_user_id?: string
  to_user_id?: string
  create_time_ms?: number
  session_id?: string
  message_type?: number
  message_state?: number
  context_token?: string
  item_list?: Array<{ type?: number; text_item?: { text?: string } }>
}

/** 刷新 context_token(iLink 的 context_token ~90-160s 过期, 发消息前应刷新, 失败返回原值) */
export async function refreshContextToken(opts: {
  token: string
  baseUrl: string
  userId: string
  contextToken: string
}): Promise<string> {
  try {
    const res = await fetch(`${opts.baseUrl}/ilink/bot/getconfig`, {
      method: "POST",
      headers: baseHeaders(opts.token),
      body: JSON.stringify({
        ilink_user_id: opts.userId,
        context_token: opts.contextToken,
        base_info: baseInfo(),
      }),
    })
    if (!res.ok) return opts.contextToken
    const json = (await res.json()) as { context_token?: string; ret?: number }
    if (json.ret !== undefined && json.ret !== 0) return opts.contextToken
    return json.context_token || opts.contextToken
  } catch {
    return opts.contextToken
  }
}

export async function getUpdates(opts: {
  token: string
  baseUrl: string
  cursor: string
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<{ ret: number; msgs?: WeixinMessage[]; get_updates_buf?: string; longpolling_timeout_ms?: number }> {
  const res = await fetch(`${opts.baseUrl}/ilink/bot/getupdates`, {
    method: "POST",
    headers: baseHeaders(opts.token),
    body: JSON.stringify({
      get_updates_buf: opts.cursor,
      base_info: baseInfo(),
    }),
    signal: opts.signal,
  })
  if (!res.ok) throw new Error(`getupdates 失败: HTTP ${res.status}`)
  const json = (await res.json()) as {
    ret?: number
    errcode?: number
    msgs?: WeixinMessage[]
    get_updates_buf?: string
    longpolling_timeout_ms?: number
  }
  // 成功响应不带 ret/errcode 字段(实测), 缺失视为 0
  const ret = json.ret ?? json.errcode ?? 0
  return { ret, msgs: json.msgs ?? [], get_updates_buf: json.get_updates_buf, longpolling_timeout_ms: json.longpolling_timeout_ms }
}

export async function sendText(opts: {
  token: string
  baseUrl: string
  toUserId: string
  contextToken: string
  text: string
}): Promise<void> {
  const clientId = `lychee-weixin:${Date.now()}-${randomBytes(4).toString("hex")}`
  const msg = {
    from_user_id: "",
    to_user_id: opts.toUserId,
    client_id: clientId,
    message_type: 2,
    message_state: 2,
    context_token: opts.contextToken,
    item_list: [{ type: 1, text_item: { text: opts.text } }],
  }
  const res = await fetch(`${opts.baseUrl}/ilink/bot/sendmessage`, {
    method: "POST",
    headers: baseHeaders(opts.token),
    body: JSON.stringify({ msg, base_info: baseInfo() }),
  })
  if (!res.ok) throw new Error(`发送失败: HTTP ${res.status}`)
  const json = (await res.json().catch(() => ({}))) as { ret?: number }
  if (json.ret !== undefined && json.ret !== 0) throw new Error(`发送失败: ret=${json.ret}`)
}

/** 按 2000 字保守上限分片(优先 \n\n, \n, 空格) */
export function chunkText(text: string, limit = 2000): string[] {
  if (text.length <= limit) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n\n", limit)
    if (cut <= 0) cut = rest.lastIndexOf("\n", limit)
    if (cut <= 0) cut = rest.lastIndexOf(" ", limit)
    if (cut <= 0) cut = limit
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  chunks.push(rest)
  return chunks
}

export async function sendTyping(opts: {
  token: string
  baseUrl: string
  userId: string
  contextToken?: string
  status: 1 | 2
}): Promise<void> {
  const cfg = await fetch(`${opts.baseUrl}/ilink/bot/getconfig`, {
    method: "POST",
    headers: baseHeaders(opts.token),
    body: JSON.stringify({
      ilink_user_id: opts.userId,
      context_token: opts.contextToken,
      base_info: baseInfo(),
    }),
  }).catch(() => undefined)
  if (!cfg?.ok) return
  const cfgJson = (await cfg.json()) as { typing_ticket?: string }
  if (!cfgJson.typing_ticket) return
  await fetch(`${opts.baseUrl}/ilink/bot/sendtyping`, {
    method: "POST",
    headers: baseHeaders(opts.token),
    body: JSON.stringify({
      ilink_user_id: opts.userId,
      typing_ticket: cfgJson.typing_ticket,
      status: opts.status,
      base_info: baseInfo(),
    }),
  }).catch(() => undefined)
}
