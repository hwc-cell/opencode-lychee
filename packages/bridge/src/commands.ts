import { installAutoStart, isAutoStartInstalled, removeAutoStart } from "./weixin/daemon"
import { t } from "./i18n"
import type { BridgeModelInfo, BridgeModelRef } from "./bot"

// 通道无关的聊天指令: 任何适配器(微信/Slack/Telegram/飞书…)接入时自动获得这些能力。
// 适配器只需在收到用户文本时先调用 handleChatCommand, 返回 true 表示已被命令消费。
// 文案按 OPENCODE_LANG 自动切换 zh/en。

export const CHAT_COMMANDS = ["/model", "/autostart", "/autostop", "/halp"]

export async function handleChatCommand(args: {
  channel: string
  text: string
  fromUserId: string
  ownerUserId?: string
  workDir: string
  reply: (text: string) => Promise<void>
  log: (msg: string) => void
  // 模型指令能力(适配器注入): 未注入时 /model 不消费
  models?: {
    list: () => Promise<BridgeModelInfo[]>
    switchModel: (model: BridgeModelRef) => Promise<boolean>
  }
}): Promise<boolean> {
  const command = args.text.trim().toLowerCase()
  const isOwner = args.fromUserId === args.ownerUserId

  if (command === "/model" || command.startsWith("/model ")) {
    if (!args.models) return false
    return handleModelCommand(args.text, args.models, args.reply, args.log)
  }

  if (command === "/halp") {
    await args.reply(t("cmdHelp"))
    args.log("聊天指令 /halp 已回复")
    return true
  }

  if (command === "/autostart" || command === "/autostop") {
    if (!isOwner) {
      await args.reply(t("cmdOwnerOnly"))
      args.log(`聊天指令 ${command} 被非 owner 拒绝 (${args.fromUserId})`)
      return true
    }
    const result =
      command === "/autostart"
        ? isAutoStartInstalled(args.channel)
          ? { ok: true, message: t("cmdAlreadyOn") }
          : installAutoStart(args.channel, args.workDir, t)
        : removeAutoStart(args.channel, t)
    await args.reply(`${result.ok ? "✅" : "⚠️"} ${result.message}`)
    args.log(`聊天指令 ${command} 执行: ${result.message}`)
    return true
  }

  return false // 不是聊天指令, 交给 AI 处理
}

const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()

async function handleModelCommand(
  raw: string,
  models: NonNullable<Parameters<typeof handleChatCommand>[0]["models"]>,
  reply: (text: string) => Promise<void>,
  log: (msg: string) => void,
): Promise<boolean> {
  const rest = raw.slice("/model".length).trim()
  const list = await models.list()

  // /model 无参数: 显示可用模型列表(含思考强度)
  if (!rest) {
    const lines = list
      .filter((m) => m.enabled !== false)
      .map((m) => {
        const variants = m.variants?.length ? ` · 强度:${m.variants.map((v) => v.id).join("/")}` : ""
        return `· ${m.name ?? m.id} (${m.providerID}/${m.id})${variants}`
      })
    if (!lines.length) {
      await reply(t("cmdModelEmpty"))
      return true
    }
    await reply(`🤖 ${t("cmdModelList")}\n${lines.join("\n")}`)
    log(`/model 已回复 ${lines.length} 个模型`)
    return true
  }

  // /model <名称> [强度]: 优先精确匹配名称; 匹配不上时试"去掉末尾词作为强度"
  const exact = list.find((m) => m.enabled !== false && normName(m.name ?? m.id) === normName(rest))
  let match: BridgeModelInfo | undefined = exact
  let variant: string | undefined
  if (!match) {
    const words = rest.split(/\s+/)
    const tail = words.at(-1)
    const head = words.slice(0, -1).join(" ")
    if (tail && head) {
      for (const m of list) {
        if (m.enabled !== false && normName(m.name ?? m.id) === normName(head) && m.variants?.some((v) => v.id === tail)) {
          match = m
          variant = tail
          break
        }
      }
    }
  }

  if (!match) {
    await reply(t("cmdModelNotFound", { name: rest }))
    log(`/model 未找到: ${rest}`)
    return true
  }

  const ok = await models.switchModel({ id: match.id, providerID: match.providerID, ...(variant ? { variant } : {}) })
  const label = `${match.name ?? match.id}${variant ? `(${t("cmdModelVariant", { v: variant })})` : ""}`
  await reply(ok ? t("cmdModelSwitched", { model: label }) : t("cmdModelSwitchFailed", { model: label }))
  log(`/model 切换 ${match.providerID}/${match.id}${variant ? `#${variant}` : ""} → ${ok ? "OK" : "FAIL"}`)
  return true
}
