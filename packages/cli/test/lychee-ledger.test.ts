import { expect, test } from "bun:test"
import { requestLedger } from "@opencode/util/lychee-ledger"
import { runLedgerCommand } from "../src/commands/handlers/ledger"

const row = { client_id: 42, date: "2026-11-28", category: "验收", amount: -35.5, note: "合成数据" }

test("ledger uses configured authentication, preserves the amount and verifies acceptance", async () => {
  const requests: Request[] = []
  const send: typeof requestLedger = (endpoint, options) =>
    requestLedger(endpoint, {
      ...options,
      key: "fixture-key",
      request: async (url, init) => {
        requests.push(new Request(url, init))
        return Response.json({ code: 0, data: { accepted_count: 1 } })
      },
    })
  const result = await runLedgerCommand(
    {
      action: "add",
      amount: "-35.50",
      category: row.category,
      date: row.date,
      note: row.note,
      limit: 20,
    },
    undefined,
    send,
  )
  expect(result).toMatchObject({ accepted_count: 1, record: { amount: -35.5, date: row.date } })
  expect(requests[0].headers.get("X-API-Key")).toBe("fixture-key")
  expect(requests[0].redirect).toBe("error")
  const payload = await requests[0].json()
  expect(Number.isSafeInteger(payload.records[0].client_id)).toBe(true)
  expect(payload).toMatchObject({
    device_id: "opencode-lychee-agent",
    records: [{ client_id: expect.any(Number), date: row.date, amount: -35.5, note: row.note }],
  })
  await expect(
    runLedgerCommand({ action: "add", amount: "35.001", category: "验收", limit: 20 }, undefined, send),
  ).rejects.toThrow()
  expect(requests).toHaveLength(1)
})

test("ledger scopes visible results and refuses ambiguous or encrypted deletion targets", async () => {
  const paths: string[] = []
  let rows = [row]
  const send: typeof requestLedger = (endpoint, options) =>
    requestLedger(endpoint, {
      ...options,
      key: "fixture-key",
      request: async (url) => {
        paths.push(url)
        return Response.json({ code: 0, data: endpoint === "/sync/all" ? { records: rows } : { deleted: 1 } })
      },
    })
  rows = [
    row,
    { ...row, client_id: 43, date: "2026-10-01" },
    { ...row, client_id: 44, encrypted_data: "opaque" } as typeof row,
  ]
  await expect(
    runLedgerCommand({ action: "list", from: "2026-11-01", limit: 20 }, undefined, send),
  ).resolves.toMatchObject({
    matched: 1,
    encrypted: 1,
    records: [{ client_id: 42 }],
  })
  await expect(runLedgerCommand({ action: "delete", id: "44", limit: 20 }, undefined, send)).rejects.toThrow(
    "无法唯一核对",
  )
  rows = [row, { ...row, note: "另一个设备" }]
  await expect(runLedgerCommand({ action: "delete", id: "42", limit: 20 }, undefined, send)).rejects.toThrow(
    "无法唯一核对",
  )
  expect(paths.filter((url) => url.endsWith("/batch-delete"))).toHaveLength(0)
  rows = [row]
  await expect(runLedgerCommand({ action: "delete", id: "42", limit: 20 }, undefined, send)).resolves.toEqual({
    client_id: 42,
    deleted: 1,
  })
})
