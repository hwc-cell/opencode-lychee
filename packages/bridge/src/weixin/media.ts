import { createDecipheriv } from "node:crypto"
import path from "node:path"
import { t } from "../i18n"
import type { WeixinMedia, WeixinMessage, WeixinMessageItem } from "./client"

const CDN_BASE = "https://novac2c.cdn.weixin.qq.com/c2c"
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_TOTAL_MAX_BYTES = 20 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 30_000

export type PromptFile = {
  uri: string
  mime: string
  name?: string
}

export type MessagePrompt = {
  text: string
  files: PromptFile[]
}

type MediaKind = "image" | "voice" | "file" | "video"

type MediaTarget = {
  kind: MediaKind
  media?: WeixinMedia
  directUrl?: string
  directKey?: string
  name: string
  encodeType?: number
  declaredSize?: number
}

function maxMediaBytes() {
  const configured = Number(process.env.LYCHEE_MEDIA_MAX_BYTES)
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MAX_BYTES
  return Math.floor(configured)
}

function maxTotalBytes(single: number) {
  const configured = Number(process.env.LYCHEE_MEDIA_TOTAL_MAX_BYTES)
  if (!Number.isFinite(configured) || configured <= 0) return Math.max(single, DEFAULT_TOTAL_MAX_BYTES)
  return Math.max(single, Math.floor(configured))
}

function cleanName(value: string | undefined, fallback: string) {
  const name = path.basename((value ?? "").replaceAll(/[\r\n\0]/g, "").trim())
  return (name || fallback).slice(0, 160)
}

function target(item: WeixinMessageItem, index: number): MediaTarget | undefined {
  if (item.image_item) {
    return {
      kind: "image",
      media: item.image_item.media ?? item.image_item.thumb_media,
      directUrl: item.image_item.url,
      directKey: item.image_item.aeskey ?? item.image_item.aes_key,
      name: `wechat-image-${index + 1}.jpg`,
      declaredSize: item.image_item.mid_size,
    }
  }
  if (item.voice_item?.media) {
    return {
      kind: "voice",
      media: item.voice_item.media,
      directKey: item.voice_item.aeskey ?? item.voice_item.aes_key,
      name: cleanName(
        item.voice_item.file_name ?? item.voice_item.fileName,
        `wechat-voice-${index + 1}${voiceExtension(item.voice_item.encode_type ?? item.voice_item.encodeType)}`,
      ),
      encodeType: item.voice_item.encode_type ?? item.voice_item.encodeType,
    }
  }
  if (item.file_item) {
    return {
      kind: "file",
      media: item.file_item.media,
      directUrl: item.file_item.url,
      directKey: item.file_item.aeskey ?? item.file_item.aes_key,
      name: cleanName(item.file_item.file_name ?? item.file_item.fileName, `wechat-file-${index + 1}.bin`),
      declaredSize: Number(item.file_item.len),
    }
  }
  if (item.video_item) {
    return {
      kind: "video",
      media: item.video_item.media,
      directUrl: item.video_item.url,
      directKey: item.video_item.aeskey ?? item.video_item.aes_key,
      name: cleanName(item.video_item.file_name ?? item.video_item.fileName, `wechat-video-${index + 1}.mp4`),
      declaredSize: item.video_item.video_size,
    }
  }
}

function voiceExtension(encodeType?: number) {
  if (encodeType === 1) return ".pcm"
  if (encodeType === 5) return ".amr"
  if (encodeType === 6) return ".silk"
  if (encodeType === 7) return ".mp3"
  if (encodeType === 8) return ".ogg"
  return ".audio"
}

function mediaUrl(input: MediaTarget) {
  const direct =
    input.directUrl ??
    input.media?.download_url ??
    input.media?.downloadUrl ??
    input.media?.full_url ??
    input.media?.fullUrl ??
    input.media?.url
  if (direct) return direct
  const query = input.media?.encrypt_query_param ?? input.media?.encryptQueryParam
  if (!query) throw new Error(t("mediaMissingUrl", { name: input.name }))
  return `${CDN_BASE}/download?encrypted_query_param=${encodeURIComponent(query)}`
}

function allowed(url: URL) {
  const host = url.hostname.toLowerCase()
  return (
    url.protocol === "https:" &&
    (host.endsWith(".weixin.qq.com") || host === "weixin.qq.com" || host.endsWith(".qpic.cn"))
  )
}

async function fetchMedia(input: string, limit: number) {
  let url = new URL(input)
  for (let redirect = 0; redirect < 3; redirect++) {
    if (!allowed(url)) throw new Error(t("mediaUntrustedUrl", { host: url.hostname }))
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new Error(t("mediaRedirectMissing", { status: response.status }))
      url = new URL(location, url)
      continue
    }
    if (!response.ok) throw new Error(t("mediaDownloadFailed", { status: response.status }))
    const announced = Number(response.headers.get("content-length"))
    if (Number.isFinite(announced) && announced > limit)
      throw new Error(t("mediaTooLarge", { mb: Math.floor(limit / 1024 / 1024) }))
    if (!response.body) return Buffer.alloc(0)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new Error(t("mediaTooLarge", { mb: Math.floor(limit / 1024 / 1024) }))
      }
      chunks.push(part.value)
    }
    return Buffer.concat(chunks)
  }
  throw new Error(t("mediaTooManyRedirects"))
}

export function decodeMediaKey(value?: string): Buffer | undefined {
  if (!value) return
  const raw = value.trim()
  if (/^[0-9a-f]{32}$/i.test(raw)) return Buffer.from(raw, "hex")
  const decoded = Buffer.from(raw.replaceAll("-", "+").replaceAll("_", "/"), "base64")
  if (decoded.length === 16) return decoded
  const text = decoded.toString("ascii")
  if (decoded.length === 32 && /^[0-9a-f]{32}$/i.test(text)) return Buffer.from(text, "hex")
}

function decrypt(payload: Buffer, key?: Buffer) {
  if (!key) return payload
  try {
    const decipher = createDecipheriv("aes-128-ecb", key, null)
    return Buffer.concat([decipher.update(payload), decipher.final()])
  } catch {
    throw new Error(t("mediaDecryptFailed"))
  }
}

function mimeFromName(name: string) {
  const extension = path.extname(name).toLowerCase()
  const known: Record<string, string> = {
    ".amr": "audio/amr",
    ".avi": "video/x-msvideo",
    ".c": "text/x-c",
    ".cpp": "text/x-c++",
    ".css": "text/css",
    ".csv": "text/csv",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".gif": "image/gif",
    ".go": "text/x-go",
    ".html": "text/html",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript",
    ".json": "application/json",
    ".md": "text/markdown",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".py": "text/x-python",
    ".rs": "text/x-rust",
    ".silk": "audio/x-silk",
    ".svg": "image/svg+xml",
    ".ts": "text/typescript",
    ".tsx": "text/tsx",
    ".txt": "text/plain",
    ".wav": "audio/wav",
    ".webm": "video/webm",
    ".webp": "image/webp",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xml": "application/xml",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".zip": "application/zip",
  }
  return known[extension]
}

function sniffMime(data: Buffer) {
  if (data.subarray(0, 4).toString() === "%PDF") return "application/pdf"
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg"
  if (data.subarray(0, 6).toString() === "GIF87a" || data.subarray(0, 6).toString() === "GIF89a") return "image/gif"
  if (data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP") return "image/webp"
  if (data.subarray(0, 2).toString() === "PK") return "application/zip"
}

function mediaMime(input: MediaTarget, data: Buffer) {
  const sniffed = sniffMime(data)
  const named = mimeFromName(input.name)
  if (sniffed === "application/zip" && named) return named
  if (sniffed) return sniffed
  if (named) return named
  if (input.kind === "image") return "image/jpeg"
  if (input.kind === "video") return "video/mp4"
  if (input.kind === "voice") {
    if (input.encodeType === 1) return "audio/L16"
    if (input.encodeType === 5) return "audio/amr"
    if (input.encodeType === 6) return "audio/x-silk"
    if (input.encodeType === 7) return "audio/mpeg"
    if (input.encodeType === 8) return "audio/ogg"
    return "audio/octet-stream"
  }
  return "application/octet-stream"
}

function fallbackText(inputs: MediaTarget[]) {
  return inputs
    .map((input) => {
      if (input.kind === "image") return t("mediaPromptImage")
      if (input.kind === "voice") return t("mediaPromptVoice")
      if (input.kind === "video") return t("mediaPromptVideo")
      return t("mediaPromptFile", { name: input.name })
    })
    .join("\n")
}

export async function messagePrompt(msg: WeixinMessage): Promise<MessagePrompt> {
  const text = (msg.item_list ?? [])
    .flatMap((item) => {
      if (item.text_item?.text) return [item.text_item.text]
      if (item.voice_item?.text) return [item.voice_item.text]
      return []
    })
    .join("\n")
  const targets = (msg.item_list ?? []).flatMap((item, index) => {
    if (item.voice_item?.text) return []
    const value = target(item, index)
    return value ? [value] : []
  })
  const limit = maxMediaBytes()
  const totalLimit = maxTotalBytes(limit)
  const files: PromptFile[] = []
  let total = 0
  for (const input of targets) {
    if (input.declaredSize && input.declaredSize > limit)
      throw new Error(t("mediaFileTooLarge", { name: input.name, mb: Math.floor(limit / 1024 / 1024) }))
    const encrypted = await fetchMedia(mediaUrl(input), limit + 32)
    const key =
      decodeMediaKey(input.directKey) ??
      decodeMediaKey(input.media?.aes_key) ??
      decodeMediaKey(input.media?.aesKey) ??
      decodeMediaKey(input.media?.aeskey)
    if ((input.media?.encrypt_type ?? input.media?.encryptType) === 1 && !key)
      throw new Error(t("mediaMissingKey", { name: input.name }))
    const data = decrypt(encrypted, key)
    if (!data.length) throw new Error(t("mediaEmpty", { name: input.name }))
    if (data.length > limit)
      throw new Error(t("mediaFileTooLarge", { name: input.name, mb: Math.floor(limit / 1024 / 1024) }))
    total += data.length
    if (total > totalLimit) throw new Error(t("mediaTotalTooLarge", { mb: Math.floor(totalLimit / 1024 / 1024) }))
    const mime = mediaMime(input, data)
    files.push({
      uri: `data:${mime};base64,${data.toString("base64")}`,
      mime,
      name: input.name,
    })
  }
  return { text: text.trim() ? text : fallbackText(targets), files }
}
