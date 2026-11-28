import { LedgerRequestError, localDate, requestLedger, type LedgerRecord } from "@opencode/util/lychee-ledger"

export { localDate, setLedgerKey } from "@opencode/util/lychee-ledger"

export function ledgerClientID(sessionID: string) {
  let hash = 0xcbf29ce484222325n
  for (const character of sessionID) {
    hash ^= BigInt(character.charCodeAt(0))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return Number(hash & 0x1fffffffffffffn)
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
  try {
    await requestLedger("/sync/upload", {
      body: { device_id: "opencode-lychee", records },
    })
    return { ok: true as const, message: "success" }
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof LedgerRequestError ? error.kind : undefined,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function ledgerValidateKey(key: string) {
  try {
    await requestLedger("/sync/all", { key: key.trim() })
    return true
  } catch {
    return false
  }
}
