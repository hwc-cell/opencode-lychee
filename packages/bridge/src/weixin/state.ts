import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

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
  // (accountId#userId) -> sessionID (opencode 会话映射)
  sessions?: Record<string, string>
  // (accountId#userId) -> 最近 context_token
  contexts?: Record<string, string>
  // 上次使用的 AI 工作目录
  workDir?: string
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
  writeFileSync(CRED_FILE, JSON.stringify(state, null, 2), { mode: 0o600 })
}

export function clearState() {
  try {
    writeFileSync(CRED_FILE, "{}", { mode: 0o600 })
  } catch {
    // 忽略
  }
}
