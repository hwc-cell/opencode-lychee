import { installAutoStart, isAutoStartInstalled, removeAutoStart } from "./weixin/daemon"

// 通道无关的聊天指令: 任何适配器(微信/Slack/Telegram/飞书…)接入时自动获得这些能力。
// 适配器只需在收到用户文本时先调用 handleChatCommand, 返回 true 表示已被命令消费。

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
    await args.reply(
      [
        "🤖 可用指令:",
        "· /autostart —— 开启后台常驻(开机自启, 崩溃重启)",
        "· /autostop —— 关闭后台常驻",
        "· /halp —— 查看本帮助",
        "其他消息直接说, 就是你的 AI 啦~",
      ].join("\n"),
    )
    return true
  }

  if (command === "/autostart" || command === "/autostop") {
    if (!isOwner) {
      await args.reply("🔒 只有扫码登录的账号才能操作哦")
      args.log(`聊天指令 ${command} 被非 owner 拒绝 (${args.fromUserId})`)
      return true
    }
    const result =
      command === "/autostart"
        ? isAutoStartInstalled(args.channel)
          ? { ok: true, message: "后台常驻已是开启状态(无需重复)" }
          : installAutoStart(args.channel, args.workDir)
        : removeAutoStart(args.channel)
    await args.reply(`${result.ok ? "✅" : "⚠️"} ${result.message}`)
    args.log(`聊天指令 ${command} 执行: ${result.message}`)
    return true
  }

  return false // 不是聊天指令, 交给 AI 处理
}
