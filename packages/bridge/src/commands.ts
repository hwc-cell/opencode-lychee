import { installAutoStart, isAutoStartInstalled, removeAutoStart } from "./weixin/daemon"
import { t } from "./i18n"

// 通道无关的聊天指令: 任何适配器(微信/Slack/Telegram/飞书…)接入时自动获得这些能力。
// 适配器只需在收到用户文本时先调用 handleChatCommand, 返回 true 表示已被命令消费。
// 文案按 OPENCODE_LANG 自动切换 zh/en。

export const CHAT_COMMANDS = ["/autostart", "/autostop", "/halp"]

export async function handleChatCommand(args: {
  channel: string
  text: string
  fromUserId: string
  ownerUserId?: string
  workDir: string
  reply: (text: string) => Promise<void>
  log: (msg: string) => void
}): Promise<boolean> {
  const command = args.text.trim().toLowerCase()
  const isOwner = args.fromUserId === args.ownerUserId

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
