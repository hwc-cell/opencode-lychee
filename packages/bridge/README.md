# @opencode-ai/bridge — 聊天软件桥核心

把任意 IM(微信 / Slack / Telegram / 飞书 / 企业微信 …)接到 OpenCode-Lychee。
**聊天指令与通知是通道无关的核心能力**, 适配器接入时自动获得:

| 指令         | 作用                                                           |
| ------------ | -------------------------------------------------------------- |
| `/model`     | 查看可用模型；`/model <名称> [强度]` 切换模型与思考强度        |
| `/new`       | 停止并丢弃当前映射，立即创建新会话                             |
| `/clear`     | 清除当前会话映射，下条消息自动创建                             |
| `/stop`      | 停止当前正在运行的任务                                         |
| `/status`    | 查看当前模型、工作目录与会话状态                               |
| `/where`     | 查看工作目录；`/where <目录>` 切换目录并清除旧会话（仅 owner） |
| `/autostart` | 开启后台常驻 (macOS launchd: 开机自启 + 崩溃重启, 仅 owner)    |
| `/autostop`  | 关闭后台常驻 (仅 owner)                                        |
| `/help`      | 查看可用指令 (`/halp` 仍兼容)                                  |

| 运行状态                  | 通知                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 开始处理                  | `🧠 收到,正在处理…`                                                                                                  |
| 模型输出                  | **实时转发**: 每 2s 把模型新生成的文本增量发给用户(默认攒够 80 字再发, 避免消息轰炸; `LYCHEE_STREAM_MIN_CHARS` 可调) |
| 等待连接中断              | 自动退避重连并继续等待同一轮任务，不重新提交用户消息                                                                 |
| 模型总等待超时            | 停止本轮、补发已生成的文本并明确提示；为避免重复工具操作，不自动重投整轮消息                                         |
| 运行中提醒(默认每 5 分钟) | `⏱️ 依然在工作,已工作X分钟(正在运行:工具)`(`LYCHEE_WORK_REMINDER_MS` 可调)                                           |
| 新消息打断运行中任务      | `⚡️已打断,当前运行:XXX`(XXX = 正在跑的文本/工具)                                                                    |

## 微信媒体消息

- 支持文字、语音转写、图片、文件和视频 item；带转写的语音优先使用文字，未带转写时把原始音频作为附件交给模型。
- CDN 地址只允许微信与 `qpic.cn` 域名，重定向也会重新校验，避免把消息字段变成任意 URL 请求入口。
- 兼容 iLink 的 `base64(raw 16 bytes)`、`base64(hex string)` 和 32 位 hex 三种 AES Key 表示；媒体使用 AES-128-ECB 在内存中解密，不写临时文件。
- 单附件默认最多 10MB、单条消息总计 20MB；设置 `LYCHEE_MEDIA_MAX_BYTES`、`LYCHEE_MEDIA_TOTAL_MAX_BYTES`（字节）可调整。最终能否理解某种音视频格式仍取决于所选模型。

## 新平台接入三步

1. **接消息**: 平台 webhook / 长轮询 → 解析出 `{ fromUserId, text }`。
2. **先跑指令核心, 再交给 AI**:

```ts
import { handleChatCommand } from "@opencode-ai/bridge"

const consumed = await handleChatCommand({
  channel: "slack", // 你的通道名, 决定 launchd 标签 com.lychee.slack
  text,
  fromUserId,
  ownerUserId, // 谁可以 /autostart (通常是平台登录账号)
  workDir,
  reply: (text) => sendToSlack(text), // 回消息给用户
  log: console.log,
})
if (consumed) return // 已被指令消费

// 否则交给 AI 核心: 自动处理打断通知 / 安全重连 / 分块回复
await enqueue(userKey, () => deliverMessage({ sdk, sessionID, text, files, reply, log }))
```

3. **(macOS) 常驻自动获得**: `/autostart` 的 launchd 安装按通道参数化,
   自动生成 `~/Library/LaunchAgents/com.lychee.<channel>.plist`。

> Linux: launchd 不可用, `/autostart` 会提示配置 systemd; 后续可按通道
> 增加 systemd unit 生成器, 接口不变。

## 设计点

- `handleChatCommand` 返回 `true` 表示指令已消费, 适配器不要再把该文本发给 AI。
- owner 检查在核心内完成, 非 owner 收到 🔒 提示并记录日志。
- `deliverMessage` 使用 Server v2 API(`/api/session/{id}/prompt|wait|interrupt|message`):
  - prompt 首次生成 `msg_` 前缀 id；递交失败后的重试始终复用同一 id，由服务端精确去重；
  - `wait` 连接中断会指数退避重连，继续等待同一轮任务；
  - 看门狗 `LYCHEE_MODEL_TIMEOUT_MS`(默认 10 分钟)超时 → interrupt → 提示用户，不重投整轮消息；
  - 运行中每 2s 刷新"当前运行"文本/工具名, 供打断通知使用;
  - 同一 `userKey` 通过 `enqueue` 串行; 支持并发接收的平台可让新消息打断旧任务后排队接管。
- 平台适配器应尽量从平台消息 ID 派生稳定的 `promptID`，使进程重启或消息重投后仍能安全去重。
- 微信长轮询与 AI 回复异步调度, 长回答期间仍能立即接收新消息并打断旧任务;失效会话会自动重建。
- 微信适配器把游标与未完成入站消息一起持久化；进程异常退出后会继续处理，不会因游标前移静默丢消息。
- 微信私聊按账号与联系人隔离；群聊还会纳入群标识，避免不同群共享 AI 会话上下文。
- **语言**: 所有文案按 `OPENCODE_LANG`(默认 zh; 带 `en` 前缀切英文)输出, 见 `i18n.ts`。
