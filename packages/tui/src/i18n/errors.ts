// 错误解释器: 常见错误 -> 中文正文 + 新手 Tip。
// 自包含(不依赖 i18n 词典), TUI 与 CLI 均可使用。
export type Explanation = { message: string; tip: string }

function isZh(): boolean {
  const raw = process.env.OPENCODE_LANG || process.env.LANG || process.env.LC_ALL || ""
  const value = raw.toLowerCase().replace(/_/g, "-")
  return value.startsWith("zh-cn") || value.startsWith("zh-sg") || value.startsWith("zh-hans") || value === "zh"
}

type Rule = { test: RegExp; message: string; tip: string }

const RULES: Rule[] = [
  {
    test: /model not found/i,
    message: "模型不存在或不可用",
    tip: "用 /models 查看当前供应商的可用模型列表; 配置里的 provider/model 名称可能写错了",
  },
  {
    test: /failed to initialize provider/i,
    message: "供应商初始化失败",
    tip: "检查该供应商的 API Key 是否正确、网络是否可达, 可用 /connect 重新配置",
  },
  {
    test: /not valid json/i,
    message: "配置文件不是有效的 JSON",
    tip: "检查 opencode.json / tui.json 的括号、引号、逗号是否完整(可以用 JSON 校验工具)",
  },
  {
    test: /is not valid\. rename the directory/i,
    message: "配置中的目录名称写错了",
    tip: "按提示把目录重命名为建议名称, 或删除该项配置",
  },
  {
    test: /mcp server .* failed/i,
    message: "MCP 服务器连接失败",
    tip: "检查 .opencode/mcp 或配置里 mcp 部分的地址与密钥; opencode 暂不支持 MCP 认证",
  },
  {
    test: /login page instead of json/i,
    message: "远程配置认证已失效",
    tip: "登录状态可能过期, 重新执行 opencode auth login 即可",
  },
  {
    test: /session not found/i,
    message: "会话不存在",
    tip: "该会话可能已被删除; 用 /sessions 查看现有会话列表",
  },
  {
    test: /(401|unauthorized|invalid api key|authentication)/i,
    message: "认证失败: API Key 无效或已过期",
    tip: "在 /connect 中重新填入该供应商的 API Key; 换过密钥的话记得重新登录",
  },
  {
    test: /(429|rate limit|quota|too many requests)/i,
    message: "请求过于频繁或达到速率限制",
    tip: "稍等几秒再试; 若是额度耗尽, 可在侧边栏查看余额并及时充值",
  },
  {
    test: /(402|insufficient.*balance|balance.*insufficient|out of credits)/i,
    message: "账户余额不足",
    tip: "侧边栏可实时查看余额; 充值后即可继续使用",
  },
  {
    test: /(econnrefused|enotfound|etimedout|fetch failed|network)/i,
    message: "网络连接失败",
    tip: "检查网络与代理设置(HTTPS_PROXY), 或稍后重试",
  },
]

export function explainError(message: string | undefined): Explanation | undefined {
  if (!message || !isZh()) return undefined
  for (const rule of RULES) {
    if (rule.test.test(message)) return { message: rule.message, tip: rule.tip }
  }
  return undefined
}

export function explainErrorText(message: string | undefined): string | undefined {
  const explanation = explainError(message)
  if (!explanation) return undefined
  return `${explanation.message}\n💡 ${explanation.tip}`
}
