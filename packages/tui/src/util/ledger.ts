import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

// 荔枝记账 (Lychee Ledger) — https://lycheeledger.cn
// API 文档见 SKILL: POST /api/v1/ledger/sync/upload, GET /sync/all, POST /sync/batch-delete
const HOST = "https://lycheeledger.cn"
const KEY_FILE = join(homedir(), ".local", "state", "opencode", "ledger.json")

export type LedgerRecord = {
  client_id: number
  date: string
  category: string
  amount: number
  note: string
  modified_ts: string
}

let cachedKey: string | undefined

export function getLedgerKey(): string | undefined {
  if (cachedKey) return cachedKey
  const env = process.env.LEDGER_KEY?.trim()
  if (env) {
    cachedKey = env
    return env
  }
  try {
    const data = JSON.parse(readFileSync(KEY_FILE, "utf8")) as { apiKey?: string }
    if (typeof data.apiKey === "string" && data.apiKey) cachedKey = data.apiKey
  } catch {
    // 文件不存在或损坏时视为未配置
  }
  return cachedKey
}

export function setLedgerKey(key: string) {
  cachedKey = key.trim()
  mkdirSync(join(homedir(), ".local", "state", "opencode"), { recursive: true })
  writeFileSync(KEY_FILE, JSON.stringify({ apiKey: cachedKey }, null, 2))
}

// 会话成本换算为人民币记录 (负数为支出)
export function buildSessionRecord(args: { title: string; costUSD: number }): LedgerRecord | undefined {
  if (args.costUSD <= 0) return undefined
  const amount = -Math.round(args.costUSD * 7.25 * 100) / 100
  return {
    client_id: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    category: "AI工具",
    amount,
    note: args.title,
    modified_ts: new Date().toISOString(),
  }
}

export async function ledgerUpload(
  records: LedgerRecord[],
): Promise<{ ok: boolean; reason?: "no-key" | "invalid-key"; message: string }> {
  const key = getLedgerKey()
  if (!key) return { ok: false, reason: "no-key", message: "未配置 API Key" }
  try {
    const res = await fetch(`${HOST}/api/v1/ledger/sync/upload`, {
      method: "POST",
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: "opencode-lychee", records }),
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "invalid-key", message: "API Key 无效或已失效" }
    }
    const json = (await res.json().catch(() => undefined)) as { code?: number; message?: string } | undefined
    if (!res.ok || json?.code !== 0) {
      return { ok: false, message: json?.message ?? `上传失败 (HTTP ${res.status})` }
    }
    return { ok: true, message: json?.message ?? "success" }
  } catch (error) {
    return { ok: false, message: `网络错误: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function ledgerValidateKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${HOST}/api/v1/ledger/sync/all`, { headers: { "X-API-Key": key.trim() } })
    return res.status === 200
  } catch {
    return false
  }
}
