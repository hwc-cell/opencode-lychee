import { randomBytes } from "node:crypto"
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const baseURL = "https://lycheeledger.cn/api/v1/ledger"
const keyDirectory = () => path.join(homedir(), ".local", "state", "opencode")
const keyFile = () => path.join(keyDirectory(), "ledger.json")

export type LedgerRecord = {
  client_id: number
  date: string
  category: string
  amount: number
  note: string
  modified_ts: string
}

export function getLedgerKey() {
  const environment = process.env.LEDGER_KEY?.trim()
  if (environment) return environment
  try {
    const data = JSON.parse(readFileSync(keyFile(), "utf8")) as { apiKey?: unknown }
    if (typeof data.apiKey === "string") return data.apiKey.trim() || undefined
  } catch {}
}

export function setLedgerKey(key: string) {
  mkdirSync(keyDirectory(), { recursive: true, mode: 0o700 })
  writeFileSync(keyFile(), JSON.stringify({ apiKey: key.trim() }), { mode: 0o600 })
  chmodSync(keyFile(), 0o600)
}

export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export class LedgerRequestError extends Error {
  constructor(
    readonly kind: "no-key" | "invalid-key" | "request",
    message: string,
  ) {
    super(message)
  }
}

type Transport = (url: string, init: RequestInit) => Promise<Response>

export async function requestLedger(
  endpoint: "/sync/all" | "/sync/upload" | "/sync/batch-delete",
  options: { body?: unknown; key?: string; signal?: AbortSignal; request?: Transport } = {},
) {
  const key = options.key ?? getLedgerKey()
  if (!key) throw new LedgerRequestError("no-key", "未配置荔枝记账 API Key。请在电脑 TUI 中使用 /ledger-key。")
  const signal = AbortSignal.timeout(15_000)
  const response = await (options.request ?? fetch)(baseURL + endpoint, {
    method: options.body === undefined ? "GET" : "POST",
    headers: { "X-API-Key": key, ...(options.body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "error",
    signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
  }).catch(() => {
    throw new LedgerRequestError("request", "荔枝记账连接失败或超时。")
  })
  if (response.status === 401 || response.status === 403)
    throw new LedgerRequestError("invalid-key", "荔枝记账 API Key 无效或无权访问。")
  if (response.status === 409)
    throw new LedgerRequestError("request", "账本存在编号冲突，操作已取消。请在荔枝记账中核对。")
  const result = (await response.json().catch(() => undefined)) as { code?: number; data?: unknown } | undefined
  if (!response.ok || result?.code !== 0)
    throw new LedgerRequestError("request", `荔枝记账未确认请求成功（HTTP ${response.status}）。`)
  return result.data
}

export function parseLedgerDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期请用 YYYY-MM-DD。")
  if (value.startsWith("0000-")) throw new Error("日期无效。")
  const date = new Date(value + "T00:00:00Z")
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("日期无效。")
  return value
}

export function buildLedgerEntry(input: {
  amount: string
  category: string
  date?: string
  note?: string
}): LedgerRecord {
  const amount = Number(input.amount)
  const category = input.category.trim()
  if (
    !/^-?\d+(?:\.\d{1,2})?$/.test(input.amount) ||
    !Number.isFinite(amount) ||
    amount === 0 ||
    Math.abs(amount) >= 1e12
  )
    throw new Error("金额必须为非零数字，最多两位小数。支出用负数，收入用正数。")
  if (!category || category.length > 60 || (input.note?.length ?? 0) > 500) throw new Error("分类或备注无效。")
  return {
    // 48 random bits fit JavaScript and the server's signed integer without losing precision.
    client_id: randomBytes(6).readUIntBE(0, 6) || 1,
    date: input.date === undefined ? localDate() : parseLedgerDate(input.date),
    category,
    amount,
    note: input.note ?? "",
    modified_ts: new Date().toISOString(),
  }
}

export type LedgerRow = Pick<LedgerRecord, "client_id" | "date" | "category" | "amount"> & {
  note?: string | null
  device_id?: string
  encrypted_data?: string | null
  deleted?: boolean
}

export function ledgerRows(data: unknown): LedgerRow[] {
  const records = (data as { records?: unknown } | null)?.records
  if (!Array.isArray(records)) throw new Error("荔枝记账没有返回可用的记录列表。")
  return records.filter((value): value is LedgerRow => {
    const row = value as Partial<LedgerRow> | null
    return (
      !!row &&
      Number.isSafeInteger(row.client_id) &&
      typeof row.date === "string" &&
      typeof row.category === "string" &&
      typeof row.amount === "number" &&
      Number.isFinite(row.amount) &&
      !row.deleted
    )
  })
}
