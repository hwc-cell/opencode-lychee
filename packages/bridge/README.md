# @opencode-ai/bridge — 聊天软件桥核心

把任意 IM(微信 / Slack / Telegram / 飞书 / 企业微信 …)接到 OpenCode-Lychee。
**聊天指令是通道无关的核心能力**: 只要适配器在收到用户文本时先走一遍
`handleChatCommand`, 就能自动获得以下指令, 无需每个平台重复实现:

| 指令 | 作用 |
| --- | --- |
| `/autostart` | 开启后台常驻 (macOS launchd: 开机自启 + 崩溃重启, 仅 owner) |
| `/autostop` | 关闭后台常驻 (仅 owner) |
| `/halp` | 查看可用指令 |

## 新平台接入三步

1. **接消息**: 平台 webhook / 长轮询 → 解析出 `{ fromUserId, text }`。
2. **先跑指令核心, 再交给 AI**:

```ts
import { handleChatCommand } from "@opencode-ai/bridge"

const consumed = await handleChatCommand({
  channel: "slack",            // 你的通道名, 决定 launchd 标签 com.lychee.slack
  text,
  fromUserId,
  ownerUserId,                 // 谁可以 /autostart (通常是平台登录账号)
  workDir,
  reply: (text) => sendToSlack(text),   // 回消息给用户
  log: console.log,
})
if (consumed) return           // 已被指令消费
// 否则走 AI: sdk.client.session.create / prompt / messages
```

3. **(macOS) 常驻自动获得**: `/autostart` 的 launchd 安装按通道参数化,
   会自动生成 `~/Library/LaunchAgents/com.lychee.<channel>.plist`,
   程序参数为 `<launcher> <channel> run --dir <workDir>`。
   launchd 自带的 `KeepAlive` 保证崩溃自动重启, 无需平台侧守护。

> Linux: launchd 不可用, `/autostart` 会提示配置 systemd; 后续可按通道
> 增加 systemd unit 生成器, 接口不变。

## 设计点

- `handleChatCommand` 返回 `true` 表示指令已消费, 适配器不要再把该文本发给 AI。
- owner 检查在核心内完成, 非 owner 收到 🔒 提示并记录日志。
- 所有聊天指令都在 `commands.ts` 的 `CHAT_COMMANDS` 中声明, 便于 `/halp` 自动列举。
