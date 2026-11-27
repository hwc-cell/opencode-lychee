// 微信 iLink Bot API 客户端
import { createCipheriv, createHash, randomBytes } from "node:crypto"
export { chunkText } from "../text"

const DEFAULT_BASE = "https://ilinkai.weixin.qq.com"
const API_TIMEOUT_MS = 30_000
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
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
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
  onQr?: (qr: { qrcode: string; qrcode_img_content: string }) => void | Promise<void>
  signal?: AbortSignal
}): Promise<{ token: string; botId: string; userId: string; baseUrl: string }> {
  let qr = await getQr()
  await opts.onQr?.(qr)
  let baseUrl = DEFAULT_BASE
  let refreshCount = 0
  for (;;) {
    let stage: QrStage
    try {
      stage = await pollQr(qr.qrcode, baseUrl, opts.signal)
    } catch (error) {
      if (opts.signal?.aborted) throw error
      // 轮询超时/网络抖动: 重试(服务端 ~30s 一轮)
      opts.onStage?.({ status: "wait" } as QrStage)
      await new Promise((r) => setTimeout(r, 1000))
      continue
    }
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
      if (refreshCount > 3) throw new Error("二维码连续过期, 请重新运行 OpenCode-Lychee weixin login")
      qr = await getQr()
      baseUrl = DEFAULT_BASE
      await opts.onQr?.(qr)
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
    await new Promise((r) => setTimeout(r, 1000))
  }
}

// ---------- 业务 ----------
export type WeixinMedia = {
  encrypt_query_param?: string
  encryptQueryParam?: string
  aes_key?: string
  aesKey?: string
  aeskey?: string
  encrypt_type?: number
  encryptType?: number
  url?: string
  full_url?: string
  fullUrl?: string
  download_url?: string
  downloadUrl?: string
}

export type WeixinMessageItem = {
  type?: number
  text_item?: { text?: string }
  voice_item?: {
    text?: string
    media?: WeixinMedia
    aeskey?: string
    aes_key?: string
    encode_type?: number
    encodeType?: number
    file_name?: string
    fileName?: string
    playtime?: number
  }
  image_item?: {
    media?: WeixinMedia
    thumb_media?: WeixinMedia
    aeskey?: string
    aes_key?: string
    url?: string
    mid_size?: number
  }
  file_item?: {
    media?: WeixinMedia
    aeskey?: string
    aes_key?: string
    url?: string
    file_name?: string
    fileName?: string
    len?: string
  }
  video_item?: {
    media?: WeixinMedia
    thumb_media?: WeixinMedia
    aeskey?: string
    aes_key?: string
    url?: string
    file_name?: string
    fileName?: string
    video_size?: number
  }
}

export type WeixinMessage = {
  seq?: number
  message_id?: number
  from_user_id?: string
  to_user_id?: string
  create_time_ms?: number
  session_id?: string
  group_id?: string
  message_type?: number
  message_state?: number
  context_token?: string
  item_list?: WeixinMessageItem[]
}

/** 合并一条消息里的文字与语音转写片段。 */
export function messageText(msg: WeixinMessage): string | undefined {
  const text = msg.item_list
    ?.flatMap((item) => {
      if (item.text_item?.text) return [item.text_item.text]
      if (item.voice_item?.text) return [item.voice_item.text]
      return []
    })
    .join("\n")
  return text || undefined
}

export async function getUpdates(opts: {
  token: string
  baseUrl: string
  cursor: string
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<{ ret: number; msgs?: WeixinMessage[]; get_updates_buf?: string; longpolling_timeout_ms?: number }> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 45_000)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  const res = await fetch(`${opts.baseUrl}/ilink/bot/getupdates`, {
    method: "POST",
    headers: baseHeaders(opts.token),
    body: JSON.stringify({
      get_updates_buf: opts.cursor,
      base_info: baseInfo(),
    }),
    signal,
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
  return {
    ret,
    msgs: json.msgs ?? [],
    get_updates_buf: json.get_updates_buf,
    longpolling_timeout_ms: json.longpolling_timeout_ms,
  }
}

type SendTarget = {
  token: string
  baseUrl: string
  toUserId: string
  contextToken: string
  clientId?: string
}
type WeixinRequest = (url: string | URL, request: RequestInit) => Promise<Response>

export async function sendText(opts: SendTarget & { text: string }): Promise<void> {
  await sendItem(opts, { type: 1, text_item: { text: opts.text } })
}

async function sendItem(opts: SendTarget, item: WeixinMessageItem, request: WeixinRequest = fetch) {
  const clientId = opts.clientId ?? `lychee-weixin:${Date.now()}-${randomBytes(4).toString("hex")}`
  const msg = {
    from_user_id: "",
    to_user_id: opts.toUserId,
    client_id: clientId,
    message_type: 2,
    message_state: 2,
    context_token: opts.contextToken,
    item_list: [item],
  }
  const res = await request(`${opts.baseUrl}/ilink/bot/sendmessage`, {
    method: "POST",
    headers: baseHeaders(opts.token),
    body: JSON.stringify({ msg, base_info: baseInfo() }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`发送失败: HTTP ${res.status}`)
  const body = await res.text()
  if (!body) return
  let json: { ret?: number; errcode?: number }
  try {
    json = JSON.parse(body) as typeof json
  } catch {
    throw new Error("发送失败: 服务端返回了无效响应")
  }
  const ret = json.ret || json.errcode || 0
  if (ret !== 0) throw new Error(`发送失败: ret=${ret}`)
}

// Tencent iLink protocol: request an upload slot, POST encrypted bytes, then send
// the download parameter and key as a generic file item.
export async function sendWeixinFile(
  opts: SendTarget & { name: string; bytes: Uint8Array },
  request: WeixinRequest = fetch,
) {
  const key = randomBytes(16)
  const filekey = randomBytes(16).toString("hex")
  const cipher = createCipheriv("aes-128-ecb", key, null)
  const encrypted = Buffer.concat([cipher.update(opts.bytes), cipher.final()])
  const slot = await request(`${opts.baseUrl}/ilink/bot/getuploadurl`, {
    method: "POST",
    headers: baseHeaders(opts.token),
    redirect: "error",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
    body: JSON.stringify({
      filekey,
      media_type: 3,
      to_user_id: opts.toUserId,
      rawsize: opts.bytes.length,
      rawfilemd5: createHash("md5").update(opts.bytes).digest("hex"),
      filesize: encrypted.length,
      no_need_thumb: true,
      aeskey: key.toString("hex"),
      base_info: baseInfo(),
    }),
  })
  if (!slot.ok) throw new Error(`附件上传准备失败: HTTP ${slot.status}`)
  const data = (await slot.json()) as {
    ret?: number
    errcode?: number
    upload_param?: string
    upload_full_url?: string
  }
  if (data.ret || data.errcode || (!data.upload_full_url && !data.upload_param))
    throw new Error("微信未返回可用的上传地址。")
  const url = new URL(data.upload_full_url ?? "https://novac2c.cdn.weixin.qq.com/c2c/upload")
  if (!data.upload_full_url) {
    url.searchParams.set("encrypted_query_param", data.upload_param!)
    url.searchParams.set("filekey", filekey)
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".cdn.weixin.qq.com") ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("微信附件上传地址不可用。")
  const uploaded = await request(url, {
    method: "POST",
    body: encrypted,
    headers: { "Content-Type": "application/octet-stream" },
    redirect: "error",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })
  const param = uploaded.headers.get("x-encrypted-param")
  if (uploaded.status !== 200 || !param) throw new Error(`附件上传未完成: HTTP ${uploaded.status}`)
  await sendItem(
    opts,
    {
      type: 4,
      file_item: {
        media: {
          encrypt_query_param: param,
          aes_key: Buffer.from(key.toString("hex")).toString("base64"),
          encrypt_type: 1,
        },
        file_name: opts.name,
        len: String(opts.bytes.length),
      },
    },
    request,
  )
}

export async function sendTyping(opts: {
  token: string
  baseUrl: string
  userId: string
  contextToken?: string
  status: 1 | 2
  signal?: AbortSignal
}): Promise<void> {
  // Activity is best effort: one slow getconfig must not hold the conversation queue.
  const timeout = AbortSignal.timeout(1500)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  const cfg = await fetch(`${opts.baseUrl}/ilink/bot/getconfig`, {
    method: "POST",
    headers: baseHeaders(opts.token),
    body: JSON.stringify({
      ilink_user_id: opts.userId,
      context_token: opts.contextToken,
      base_info: baseInfo(),
    }),
    signal,
  }).catch(() => undefined)
  if (!cfg?.ok) return
  const cfgJson = (await cfg.json().catch(() => undefined)) as { typing_ticket?: string } | undefined
  if (!cfgJson?.typing_ticket || signal.aborted) return
  await fetch(`${opts.baseUrl}/ilink/bot/sendtyping`, {
    method: "POST",
    headers: baseHeaders(opts.token),
    body: JSON.stringify({
      ilink_user_id: opts.userId,
      typing_ticket: cfgJson.typing_ticket,
      status: opts.status,
      base_info: baseInfo(),
    }),
    signal,
  }).catch(() => undefined)
}
