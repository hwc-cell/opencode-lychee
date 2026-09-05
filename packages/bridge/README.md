# @opencode-ai/bridge — 聊天软件桥核心

把任意 IM(微信 / Slack / Telegram / 飞书 / 企业微信 …)接到 OpenCode-Lychee。
**聊天指令与通知是通道无关的核心能力**, 适配器接入时自动获得:

| 指令 | 作用 |
| --- | --- |
| `/autostart` | 开启后台常驻 (macOS launchd: 开机自启 + 崩溃重启, 仅 owner) |
| `/autostop` | 关闭后台常驻 (仅 owner) |
| `/halp` | 查看可用指令 |

| 运行状态 | 通知 |
| --- | --- |
| 开始处理 | `🧠 收到,正在处理…` |
| 模型输出 | **实时转发**: 每 2s 把模型新生成的文本增量发给用户(攒够 4 字即发, 像看到打字过程) |
| 模型超时/失败 | `⚡️模型超时,已尝试X/3次`(自动重试, 重试前先补发已生成的文本) |
| 运行中提醒(默认每 5 分钟) | `⏱️ 依然在工作,已工作X分钟(正在运行:工具)`(`LYCHEE_WORK_REMINDER_MS` 可调) |
| 新消息打断运行中任务 | `⚡️已打断,当前运行:XXX`(XXX = 正在跑的文本/工具) |

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

// 否则交给 AI 核心: 自动处理打断通知 / 超时重试 / 分块回复
await enqueue(userKey, () =>
  deliverMessage({ sdk, sessionID, text, reply, log }),
)
```

3. **(macOS) 常驻自动获得**: `/autostart` 的 launchd 安装按通道参数化,
   自动生成 `~/Library/LaunchAgents/com.lychee.<channel>.plist`。

> Linux: launchd 不可用, `/autostart` 会提示配置 systemd; 后续可按通道
> 增加 systemd unit 生成器, 接口不变。

## 设计点

- `handleChatCommand` 返回 `true` 表示指令已消费, 适配器不要再把该文本发给 AI。
- owner 检查在核心内完成, 非 owner 收到 🔒 提示并记录日志。
- `deliverMessage` 使用 Server v2 API(`/api/session/{id}/prompt|wait|interrupt|message`):
  - prompt 每次尝试生成 `msg_` 前缀新 id(失败后复用会冲突);
  - 看门狗 `LYCHEE_MODEL_TIMEOUT_MS`(默认 10 分钟)超时 → interrupt → 重试;
  - 运行中每 2s 刷新"当前运行"文本/工具名, 供打断通知使用;
  - 同一 `userKey` 通过 `enqueue` 串行, 新消息打断旧任务后排队接管。
- **语言**: 所有文案按 `OPENCODE_LANG`(默认 zh; 带 `en` 前缀切英文)输出, 见 `i18n.ts`。
