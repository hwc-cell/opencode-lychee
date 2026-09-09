import type { Auth } from "@/auth"

export type BalanceResult = { supported: boolean; currency?: string; amount?: string }
type BalanceDef = {
  url: string
  parse: (json: Record<string, unknown>) => { currency: string; amount: string } | undefined
}

// 官方余额查询接口(见各厂商文档)。未列出的厂商没有公开余额接口, 返回 supported: false。
const REGISTRY: Record<string, BalanceDef> = {
  // https://api-docs.deepseek.com/api/get-user-balance/
  deepseek: {
    url: "https://api.deepseek.com/user/balance",
    parse: (json) => {
      const info = (json.balance_infos as Array<Record<string, unknown>> | undefined)?.[0]
      if (!info) return
      return { currency: String(info.currency ?? "CNY"), amount: String(info.total_balance ?? "") }
    },
  },
  // https://platform.kimi.ai/docs/api/balance (Moonshot)
  moonshot: {
    url: "https://api.moonshot.cn/v1/users/me/balance",
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
  // https://openrouter.ai/docs/api/api-reference/credits/get-credits
  openrouter: {
    url: "https://openrouter.ai/api/v1/credits",
    parse: (json) => {
      const data = json.data as Record<string, unknown> | undefined
      const total = Number(data?.total_credits)
      const used = Number(data?.total_usage)
      if (!Number.isFinite(total) || !Number.isFinite(used)) return
      return { currency: "USD", amount: Math.max(0, total - used).toFixed(2) }
    },
  },
  // https://docs.siliconflow.com/api-reference/userinfo/get-user-info
  siliconflow: {
    url: "https://api.siliconflow.cn/v1/user/info",
    parse: (json) => {
      const data = json.data as Record<string, unknown> | undefined
      const balance = data?.balance
      if (balance == null) return
      return { currency: "USD", amount: String(balance) }
    },
  },
  // https://open.bigmodel.cn/api/paas/v4/balance (智谱/GLM, 响应字段随套餐变化, 弹性解析)
  zhipu: {
    url: "https://open.bigmodel.cn/api/paas/v4/balance",
    parse: (json) => {
      const data = json.data as Record<string, unknown> | undefined
      const pick = (obj: Record<string, unknown> | undefined) => {
        if (!obj) return
        for (const key of ["total_balance", "balance", "amount", "total", "available", "total_amount"]) {
          const value = obj[key]
          if (value != null && (typeof value === "number" || typeof value === "string")) return [key, String(value)] as const
        }
      }
      const found = pick(data) ?? pick(json)
      if (!found) return
      return { currency: "CNY", amount: found[1] }
    },
  },
}

export async function checkBalance(providerID: string, auth: Auth.Info | undefined): Promise<BalanceResult> {
  const def = REGISTRY[providerID]
  if (!def || !auth) return { supported: false }
  const key = auth.type === "oauth" ? auth.access : auth.type === "api" ? auth.key : auth.token
  if (!key) return { supported: false }
  try {
    const res = await fetch(def.url, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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

export * as ProviderBalance from "./balance"
