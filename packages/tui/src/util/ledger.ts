import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const host = "https://lycheeledger.cn"
const keyFile = join(homedir(), ".local", "state", "opencode", "ledger.json")

export type LedgerRecord = {
  client_id: number
  date: string
  category: string
  amount: number
  note: string
  modified_ts: string
}

let cachedKey: string | undefined

export function getLedgerKey() {
  if (cachedKey) return cachedKey
  const environment = process.env.LEDGER_KEY?.trim()
  if (environment) {
    cachedKey = environment
    return environment
  }
  try {
    const data = JSON.parse(readFileSync(keyFile, "utf8")) as { apiKey?: string }
    if (typeof data.apiKey === "string" && data.apiKey) cachedKey = data.apiKey
  } catch {
    // Missing or damaged local state means the optional integration is not configured.
  }
  return cachedKey
}

export function setLedgerKey(key: string) {
  cachedKey = key.trim()
  mkdirSync(join(homedir(), ".local", "state", "opencode"), { recursive: true })
  writeFileSync(keyFile, JSON.stringify({ apiKey: cachedKey }, null, 2), { mode: 0o600 })
  chmodSync(keyFile, 0o600)
}

export function ledgerClientID(sessionID: string) {
  let hash = 0xcbf29ce484222325n
  for (const character of sessionID) {
    hash ^= BigInt(character.charCodeAt(0))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return Number(hash & 0x1fffffffffffffn)
}

export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function buildSessionRecord(input: { sessionID: string; title: string; costUSD: number }) {
  if (input.costUSD <= 0) return
  return {
    client_id: ledgerClientID(input.sessionID),
    date: localDate(),
    category: "AI工具",
    amount: -Math.round(input.costUSD * 7.25 * 100) / 100,
    note: input.title,
    modified_ts: new Date().toISOString(),
  } satisfies LedgerRecord
}

export async function ledgerUpload(records: LedgerRecord[]) {
  const key = getLedgerKey()
  if (!key) return { ok: false as const, reason: "no-key" as const, message: "未配置 API Key" }
  try {
    const response = await fetch(`${host}/api/v1/ledger/sync/upload`, {
      method: "POST",
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: "opencode-lychee", records }),
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 401 || response.status === 403)
      return { ok: false as const, reason: "invalid-key" as const, message: "API Key 无效或已失效" }
    const body = (await response.json().catch(() => undefined)) as { code?: number; message?: string } | undefined
    if (!response.ok || body?.code !== 0)
      return { ok: false as const, message: body?.message ?? `上传失败 (HTTP ${response.status})` }
    return { ok: true as const, message: body.message ?? "success" }
  } catch (error) {
    return { ok: false as const, message: `网络错误: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function ledgerValidateKey(key: string) {
  try {
    const response = await fetch(`${host}/api/v1/ledger/sync/all`, {
      headers: { "X-API-Key": key.trim() },
      signal: AbortSignal.timeout(15_000),
    })
    return response.status === 200
  } catch {
    return false
  }
}
