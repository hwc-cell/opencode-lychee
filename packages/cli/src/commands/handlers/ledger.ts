import { Effect, Option } from "effect"
import {
  buildLedgerEntry,
  LedgerRequestError,
  ledgerRows,
  parseLedgerDate,
  requestLedger,
} from "@opencode/util/lychee-ledger"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"

type Input = {
  action: "list" | "add" | "delete"
  amount?: string
  category?: string
  date?: string
  note?: string
  from?: string
  to?: string
  id?: string
  limit: number
}

export async function runLedgerCommand(input: Input, signal?: AbortSignal, request = requestLedger) {
  const hasDateRange = input.from !== undefined || input.to !== undefined
  if (input.action === "add") {
    if (hasDateRange || input.id !== undefined)
      throw new Error("新增记录请使用 --amount、--category、--date 和 --note。")
    if (input.amount === undefined || input.category === undefined) throw new Error("记账需要 --amount 和 --category。")
    const record = buildLedgerEntry({ ...input, amount: input.amount, category: input.category })
    const response = await request("/sync/upload", {
      body: { device_id: "opencode-lychee-agent", records: [record] },
      signal,
    }).catch((error: Error) => {
      if (error instanceof LedgerRequestError && error.kind !== "request") throw error
      throw new Error(`${error.message} 请先用 ledger list --id ${record.client_id} 核对，再决定是否重试。`)
    })
    const accepted = (response as { accepted_count?: unknown } | null)?.accepted_count
    if (accepted !== 1) throw new Error(`未确认入账。请用 ledger list --id ${record.client_id} 核对。`)
    return { record, accepted_count: accepted }
  }

  if (
    input.amount !== undefined ||
    input.category !== undefined ||
    input.date !== undefined ||
    input.note !== undefined
  )
    throw new Error("--amount、--category、--date 和 --note 只用于新增记录。")
  if (input.action === "delete" && hasDateRange) throw new Error("删除按 --id 定位。请先用 list 核对日期等信息。")
  const id = input.id === undefined ? undefined : Number(input.id)
  if (input.id !== undefined && (!/^-?\d+$/.test(input.id) || !Number.isSafeInteger(id)))
    throw new Error("--id 必须是记录的完整整数编号。")
  if (input.action === "delete" && id === undefined) throw new Error("删除需要明确的 --id。请先查询并核对记录。")
  const from = input.from === undefined ? undefined : parseLedgerDate(input.from)
  const to = input.to === undefined ? undefined : parseLedgerDate(input.to)
  if (from && to && from > to) throw new Error("起始日期应早于或等于结束日期。")
  const rows = ledgerRows(await request("/sync/all", { signal }))
  if (input.action === "delete") {
    const candidates = rows.filter((row) => row.client_id === id)
    if (candidates.length !== 1 || candidates[0].encrypted_data)
      throw new Error("无法唯一核对要删除的明文记录。请在账本应用中确认。")
    const response = await request("/sync/batch-delete", { body: { client_ids: [id] }, signal })
    const deleted = (response as { deleted?: unknown } | null)?.deleted
    if (deleted !== 0 && deleted !== 1) throw new Error("删除结果不明确。请查询账本确认。")
    return { client_id: id, deleted }
  }

  const filtered = rows
    .filter(
      (row) => (id === undefined || id === row.client_id) && (!from || row.date >= from) && (!to || row.date <= to),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.client_id - a.client_id)
  const visible = filtered.filter((row) => !row.encrypted_data)
  return {
    matched: visible.length,
    encrypted: filtered.length - visible.length,
    records: visible.slice(0, input.limit).map(({ client_id, date, category, amount, note, device_id }) => ({
      client_id,
      date,
      category,
      amount,
      note,
      device_id,
    })),
  }
}

export default Runtime.handler(Commands.commands.ledger, (input) =>
  Effect.tryPromise({
    try: async (signal) => {
      const result = await runLedgerCommand(
        {
          action: input.action,
          amount: Option.getOrUndefined(input.amount),
          category: Option.getOrUndefined(input.category),
          date: Option.getOrUndefined(input.date),
          note: Option.getOrUndefined(input.note),
          from: Option.getOrUndefined(input.from),
          to: Option.getOrUndefined(input.to),
          id: Option.getOrUndefined(input.id),
          limit: input.limit,
        },
        signal,
      )
      process.stdout.write(JSON.stringify(result, null, 2) + "\n")
    },
    catch: (error) => (error instanceof Error ? error : new Error("荔枝记账操作未完成。")),
  }),
)
