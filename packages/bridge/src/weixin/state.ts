import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { WeixinMessage } from "./client"

// 微信 iLink Bot 凭证与状态存储
// 协议: https://raw.githubusercontent.com/epiral/weixin-bot/main/docs/protocol-spec.md
const STATE_DIR = join(homedir(), ".local", "state", "opencode")
const CRED_FILE = join(STATE_DIR, "weixin.json")

export type WeixinCredential = {
  token: string
  baseUrl: string
  accountId: string
  userId: string
  savedAt: string
}

export type WeixinState = {
  credential?: WeixinCredential
  cursor?: string
  // 已从微信确认接收、但尚未完整处理成功的消息。与 cursor 同次落盘，防止进程崩溃后丢消息。
  inbox?: Record<string, WeixinMessage>
  // (accountId#userId) -> sessionID (opencode 会话映射)
  sessions?: Record<string, string>
  // (accountId#userId) -> 最近 context_token
  contexts?: Record<string, string>
  // 上次使用的 AI 工作目录
  workDir?: string
  // (accountId#userId) -> 用户选择的模型(微信 /model 切换)
  models?: Record<string, { id: string; providerID: string; variant?: string }>
  // 默认模型(OpenCode-Lychee weixin configure 配置; 未配置时微信发消息会被引导配置)
  model?: { id: string; providerID: string; variant?: string }
  health?: {
    status: "starting" | "online" | "offline" | "expired" | "stopped"
    pid?: number
    updatedAt: string
    startedAt?: string
    lastInboundAt?: string
    lastOutboundAt?: string
    lastError?: string
  }
}

export function readState(): WeixinState {
  try {
    return JSON.parse(readFileSync(CRED_FILE, "utf8")) as WeixinState
  } catch {
    return {}
  }
}

export function writeState(state: WeixinState) {
  mkdirSync(STATE_DIR, { recursive: true })
  const tmp = `${CRED_FILE}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 })
  renameSync(tmp, CRED_FILE)
  chmodSync(CRED_FILE, 0o600)
}

export function updateState(update: (state: WeixinState) => void): WeixinState {
  const state = readState()
  update(state)
  writeState(state)
  return state
}

export function clearState() {
  try {
    writeState({})
  } catch {
    // 忽略
  }
}
