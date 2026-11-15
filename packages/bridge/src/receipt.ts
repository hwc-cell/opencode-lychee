import { bridgeLang } from "./i18n"

type EvidenceStatus = "succeeded" | "failed" | "unconfirmed"

export type TurnReceipt = {
  durationMs: number
  files: string[]
  tools: { completed: number; failed: number }
  checks: Array<{ command: string; status: "passed" | "failed" | "unconfirmed" }>
  git: { commit: EvidenceStatus; push: EvidenceStatus }
  costUSD?: number
}

export type ReceiptMessage = {
  cost?: number
  snapshot?: { files?: string[] }
  content?: Array<{
    type?: string
    text?: string
    name?: string
    executed?: boolean
    state?: {
      status?: string
      input?: Record<string, unknown>
      metadata?: Record<string, unknown>
    }
  }>
}

/** Summarize recorded tool results, never the assistant's claims about what ran. */
export function turnReceipt(messages: ReceiptMessage[], durationMs: number): TurnReceipt {
  const files = new Set(messages.flatMap((message) => message.snapshot?.files ?? []))
  const tools = messages
    .flatMap((message) => message.content ?? [])
    .filter((part) => part.type === "tool" && part.executed !== false)
  const checks: TurnReceipt["checks"] = []
  const git: TurnReceipt["git"] = { commit: "unconfirmed", push: "unconfirmed" }
  for (const tool of tools) {
    const state = tool.state
    if (state?.status === "completed" && ["write", "edit", "patch"].includes(tool.name ?? "")) {
      if (typeof state.input?.path === "string") files.add(state.input.path)
      if (Array.isArray(state.metadata?.files)) {
        for (const file of state.metadata.files) {
          if (typeof file === "object" && file !== null && "file" in file && typeof file.file === "string")
            files.add(file.file)
        }
      }
    }
    if (tool.name !== "shell" || typeof state?.input?.command !== "string") continue
    const command = state.input.command.trim()
    // A final exit code does not prove each command in a script succeeded. Keep these unconfirmed.
    if (/[\n\r;&|`<>]/.test(command) || command.includes("$(")) continue
    const exit = state.metadata?.exit
    const finished =
      state.status === "completed" &&
      state.metadata?.status !== "running" &&
      !state.metadata?.timeout &&
      !state.metadata?.killed
    const status = finished && typeof exit === "number" ? (exit === 0 ? "passed" : "failed") : "unconfirmed"
    const informational = /(?:^|\s)(?:--dry-run|--help|--version|-h|-n)(?=\s|$)/.test(command)
    const check = command.match(
      /^(bun|npm|pnpm|yarn)\s+(?:(?:run\s+)?(test(?::[\w-]+)?|check|typecheck(?::[\w-]+)?|lint))(?=\s|$)|^(pytest|cargo\s+test|go\s+test|swift\s+test)(?=\s|$)/,
    )
    if (check) checks.push({ command: check[0], status: informational ? "unconfirmed" : status })
    const action = command.match(/^git\s+(commit|push)(?=\s|$)/)?.[1]
    if ((action === "commit" || action === "push") && !informational) {
      git[action] = status === "passed" ? "succeeded" : status
    }
  }
  const costs = messages.flatMap((message) =>
    typeof message.cost === "number" && Number.isFinite(message.cost) && message.cost >= 0 ? [message.cost] : [],
  )
  return {
    durationMs: Math.max(0, durationMs),
    files: [...files],
    tools: {
      completed: tools.filter((tool) => tool.state?.status === "completed").length,
      failed: tools.filter((tool) => tool.state?.status === "error").length,
    },
    checks,
    git,
    ...(costs.length ? { costUSD: costs.reduce((sum, cost) => sum + cost, 0) } : {}),
  }
}

export function formatReceipt(receipt: TurnReceipt) {
  const en = bridgeLang() === "en"
  const status = (value: string) =>
    ({
      succeeded: en ? "succeeded" : "成功",
      passed: en ? "passed" : "通过",
      failed: en ? "failed" : "失败",
      unconfirmed: en ? "unconfirmed" : "未确认",
    })[value]
  const files = receipt.files.slice(0, 10).join("、")
  return [
    en ? "📋 Task receipt" : "📋 任务回执",
    `${en ? "Duration" : "耗时"}: ${Math.ceil(receipt.durationMs / 1000)}s`,
    `${en ? "Recorded file changes" : "记录到的文件改动"}: ${files || (en ? "none recorded" : "暂无记录")}${receipt.files.length > 10 ? ` (+${receipt.files.length - 10})` : ""}`,
    `${en ? "Tools" : "工具执行"}: ${receipt.tools.completed} ${en ? "completed" : "完成"}, ${receipt.tools.failed} ${en ? "failed" : "失败"}`,
    `${en ? "Checks" : "检查"}: ${
      receipt.checks.length
        ? receipt.checks
            .slice(0, 10)
            .map((check) => `${check.command}: ${status(check.status)}`)
            .join("; ")
        : en
          ? "unconfirmed"
          : "未确认"
    }`,
    `Git commit: ${status(receipt.git.commit)}; push: ${status(receipt.git.push)}`,
    ...(receipt.costUSD === undefined
      ? []
      : [`${en ? "Recorded cost" : "已记录费用"}: $${receipt.costUSD.toFixed(4)}`]),
  ].join("\n")
}
