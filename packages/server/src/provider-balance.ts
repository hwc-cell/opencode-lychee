import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export type BalanceResult = { supported: boolean; currency?: string; amount?: string }
type AuthEntry = { type: "oauth" | "api" | "wellknown"; key?: string; access?: string; token?: string }

type BalanceDef = {
  url: string
  env: string
  parse: (json: Record<string, unknown>) => { currency: string; amount: string } | undefined
}

// 官方余额查询接口(见各厂商文档)。未列出的厂商没有公开余额接口, 返回 supported: false。
const REGISTRY: Record<string, BalanceDef> = {
  // https://api-docs.deepseek.com/api/get-user-balance/
  deepseek: {
    url: "https://api.deepseek.com/user/balance",
    env: "DEEPSEEK_API_KEY",
    parse: (json) => {
      const info = (json.balance_infos as Array<Record<string, unknown>> | undefined)?.[0]
      if (!info) return
      return { currency: String(info.currency ?? "CNY"), amount: String(info.total_balance ?? "") }
    },
  },
  // https://platform.kimi.ai/docs/api/balance (Moonshot)
  moonshot: {
    url: "https://api.moonshot.cn/v1/users/me/balance",
    env: "MOONSHOT_API_KEY",
    parse: (json) => {
      const raw = json.data as Record<string, unknown> | Array<Record<string, unknown>> | undefined
      const item = Array.isArray(raw) ? raw[0] : raw
      if (!item) return
      return {
        currency: String(item.currency ?? "CNY"),
        amount: String(item.available_balance ?? item.balance ?? item.total_balance ?? ""),
      }
    },
  },
  // https://openrouter.ai/docs/api-reference/limits
  openrouter: {
    url: "https://openrouter.ai/api/v1/credits",
    env: "OPENROUTER_API_KEY",
    parse: (json) => {
      const data = json.data as Record<string, unknown> | undefined
      const limit = data?.limit
      if (limit == null) return
      return { currency: "USD", amount: String(limit) }
    },
  },
  // OpenAI credit grants 接口返回单位为美分
  openai: {
    url: "https://api.openai.com/dashboard/billing/credit_grants",
    env: "OPENAI_API_KEY",
    parse: (json) => {
      const cents = json.total_available
      if (cents == null) return
      return { currency: "USD", amount: (Number(cents) / 100).toFixed(2) }
    },
  },
}

function authFilePath(): string {
  // 与 opencode 的 ~/.local/share/opencode/auth.json 一致
  return join(homedir(), ".local", "share", "opencode", "auth.json")
}

async function readAuthEntry(providerID: string): Promise<AuthEntry | undefined> {
  try {
    const raw = await readFile(authFilePath(), "utf8")
    const data = JSON.parse(raw) as Record<string, AuthEntry>
    return data[providerID]
  } catch {
    return undefined
  }
}

export async function checkBalance(providerID: string): Promise<BalanceResult> {
  const def = REGISTRY[providerID]
  if (!def) return { supported: false }

  const auth = await readAuthEntry(providerID)
  const key = auth ? (auth.type === "oauth" ? auth.access : auth.key ?? auth.token) : undefined
  const envKey = process.env[def.env]
  const token = (envKey || key)?.trim()
  if (!token) return { supported: false }

  try {
    const res = await fetch(def.url, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { supported: false }
    const json = (await res.json()) as Record<string, unknown>
    const parsed = def.parse(json)
    return parsed ? { supported: true, ...parsed } : { supported: false }
  } catch {
    return { supported: false }
  }
}
