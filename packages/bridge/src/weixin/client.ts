// 微信 iLink Bot API 客户端(仅文本; 媒体见协议文档 §8, v2 实现)
import { randomBytes } from "node:crypto"

const DEFAULT_BASE = "https://ilinkai.weixin.qq.com"

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
  }
}

function baseInfo() {
  return { channel_version: "1.0.0" }
}

// ---------- 登录 ----------
export type QrStage =
  | { status: "wait" }
  | { status: "scaned" }
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

export async function pollQr(qrcode: string, signal?: AbortSignal): Promise<QrStage> {
  const res = await fetch(`${DEFAULT_BASE}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, {
    headers: { "iLink-App-ClientVersion": "1", SKRouteTag: "1001" },
    signal,
  })
  if (!res.ok) throw new Error(`轮询二维码失败: HTTP ${res.status}`)
  return (await res.json()) as QrStage
}

/** 长轮询扫码状态直到 confirmed / expired; onStage 用于打印进度 */
export async function loginUntilConfirmed(opts: {
  onStage?: (stage: QrStage) => void
  signal?: AbortSignal
}): Promise<{ token: string; botId: string; userId: string; baseUrl: string }> {
  const { qrcode } = await getQr()
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000))
    const stage = await pollQr(qrcode, opts.signal)
    if (stage.status === "confirmed") {
      return {
        token: stage.bot_token,
        botId: stage.ilink_bot_id,
        userId: stage.ilink_user_id,
        baseUrl: stage.baseurl ?? DEFAULT_BASE,
      }
    }
    if (stage.status === "expired") throw new Error("二维码已过期, 请重跑 login")
    opts.onStage?.(stage)
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
  const json = (await res.json()) as {
    ret?: number
    msgs?: WeixinMessage[]
    get_updates_buf?: string
    longpolling_timeout_ms?: number
  }
  return { ret: json.ret ?? -1, msgs: json.msgs ?? [], get_updates_buf: json.get_updates_buf, longpolling_timeout_ms: json.longpolling_timeout_ms }
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
