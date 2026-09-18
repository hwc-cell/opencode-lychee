<p align="center">
  <picture>
    <source srcset="packages/ui/src/assets/favicon/lychee.png" media="(prefers-color-scheme: dark)">
    <img src="packages/ui/src/assets/favicon/lychee.png" alt="OpenCode-Lychee 标志" width="180">
  </picture>
</p>

<h1 align="center">OpenCode-Lychee 🍈</h1>

<p align="center">
  <strong>更适合中文开发者使用的 OpenCode 衍生版</strong><br>
  中文界面、微信接入、会话小结、成本记账与 macOS 语音输入
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#微信接入">微信接入</a> ·
  <a href="README.en.md">English</a> ·
  <a href="https://github.com/anomalyco/opencode">上游项目</a>
</p>

---

## OpenCode-Lychee 是什么？

OpenCode-Lychee（荔枝）基于开源 AI 编码代理 [OpenCode](https://github.com/anomalyco/opencode) 开发，在保留上游会话引擎、插件系统、工具能力和模型兼容性的基础上，补充了中文本地化与面向日常使用的效率功能。

这是社区维护的衍生版本，并非 OpenCode、腾讯或微信的官方发行版。

## 主要功能

| 功能             | 说明                                                                               |
| ---------------- | ---------------------------------------------------------------------------------- |
| 中文体验         | 核心 TUI、命令面板、权限弹窗、帮助文本与 CLI 输出已中文化；可按系统语言自动切换    |
| 微信聊天桥       | 扫码连接微信 Bot，支持流式回复、切换模型、思考强度、后台常驻和运行状态提醒         |
| 可靠消息处理     | 入站消息持久化、断线恢复、群聊会话隔离；网络抖动时安全重连，避免整轮任务被重复执行 |
| 荔枝小结         | 会话关闭时生成中文总结卡片，并保存到 `.opencode/reports/`                          |
| 自动记账         | 将会话中的 AI 成本记录到[荔枝记账](https://lycheeledger.cn)                        |
| 密钥模型收录     | 自动读取本地 `auth.json` 中已配置密钥的提供商，供模型列表与切换功能使用            |
| macOS 语音输入   | 按住左 Command 说话，松开后使用本地 Whisper 转写并填入输入框                       |
| 荔枝品牌与信息页 | 提供终端荔枝图标、像素字画和 `/about` 项目信息页                                   |

## 快速开始

### 1. 准备环境

- [Git](https://git-scm.com/)
- [Bun](https://bun.sh/)（推荐使用仓库声明的 `1.3.14` 版本）

### 2. 获取并运行源码

```bash
git clone https://github.com/hwc-cell/opencode-lychee.git
cd opencode-lychee
bun install
bun run dev
```

### 3. 安装快捷启动命令（可选）

在仓库根目录执行：

```bash
mkdir -p ~/.local/bin
ln -sfn "$PWD/packages/opencode/lychee.sh" ~/.local/bin/OpenCode-Lychee
```

确保 `~/.local/bin` 已加入 `PATH`。之后进入任意项目目录，运行：

```bash
OpenCode-Lychee
```

快捷命令直接链接到当前仓库，因此移动或删除仓库后需要重新创建链接。

## 微信接入

### 首次连接

```bash
OpenCode-Lychee weixin login       # 扫码登录；首次登录会继续引导配置模型
OpenCode-Lychee weixin configure   # 可选：重新配置默认模型与思考强度
OpenCode-Lychee weixin autostart   # macOS：开机自启并在崩溃后自动重启
```

非 macOS 系统可使用 `OpenCode-Lychee weixin run` 在前台运行聊天桥。

### 常用管理命令

| 命令                               | 用途                               |
| ---------------------------------- | ---------------------------------- |
| `OpenCode-Lychee weixin run`       | 临时在前台运行                     |
| `OpenCode-Lychee weixin status`    | 查看登录、后台服务和实际连接状态   |
| `OpenCode-Lychee weixin configure` | 重新选择默认模型与思考强度         |
| `OpenCode-Lychee weixin autostart` | 安装 macOS 后台常驻服务            |
| `OpenCode-Lychee weixin autostop`  | 移除后台常驻服务                   |
| `OpenCode-Lychee weixin logout`    | 退出并清除本地登录、会话和连接状态 |

### 微信内指令

| 指令                       | 用途                                              |
| -------------------------- | ------------------------------------------------- |
| `/model`                   | 查看可用模型                                      |
| `/model <名称> [强度]`     | 切换模型及思考强度，例如 `/model deepseek v4 max` |
| `/autostart` / `/autostop` | 开启或关闭后台常驻（仅扫码登录的账号可操作）      |
| `/help`                    | 查看帮助；旧拼写 `/halp` 仍兼容                   |

聊天桥会增量发送模型输出，长任务默认每 5 分钟报告一次状态。新消息可以打断正在运行的任务；等待连接中断时会自动恢复。如果模型达到总等待上限，本轮会被停止并明确提示，不会重新提交整轮消息，从而避免工具操作重复执行。

更多适配器开发说明见 [`packages/bridge/README.md`](packages/bridge/README.md)。

> 微信接入使用腾讯微信 iLink Bot（ClawBot）接口。扫码即表示授权 Bot 收发消息；平台策略与能力可能变化，请仅使用你有权操作的账号。

## TUI 扩展命令

| 指令          | 用途                           |
| ------------- | ------------------------------ |
| `/about`      | 查看项目来源与维护信息         |
| `/summary`    | 开启或关闭会话结束时的荔枝小结 |
| `/autolychee` | 开启或关闭会话成本自动记账     |
| `/ledger-key` | 保存荔枝记账 API 密钥          |

macOS 语音输入可通过以下命令安装：

```bash
OpenCode-Lychee voice install
```

安装过程需要 Xcode Command Line Tools，并会安装或调用 `whisper.cpp`、下载本地语音模型。随后根据终端提示授予辅助功能与麦克风权限。

## 语言设置

直接运行源码时，程序会根据 `LANG` 自动选择语言，也可以显式设置：

```bash
OPENCODE_LANG=zh bun run dev
OPENCODE_LANG=en bun run dev
```

`OpenCode-Lychee` 快捷启动器默认使用中文。如需临时切换英文：

```bash
LYCHEE_LANG=en OpenCode-Lychee
```

## 数据与密钥

- 微信登录凭证保存在 `~/.local/state/opencode/weixin.json`，文件权限会设置为仅当前用户可读写。
- 模型密钥沿用 OpenCode 的本地认证存储，不会写入项目代码或普通配置文件。
- 不要提交、截图或分享任何 API Key、登录凭证及状态文件；如果密钥曾公开，请立即在对应平台撤销并重新生成。

## 与上游的关系

本项目持续合并 [anomalyco/opencode](https://github.com/anomalyco/opencode) 的更新。OpenCode 的配置、插件和模型提供商文档通常仍然适用；如果荔枝扩展与上游行为不同，以本仓库说明为准。

遇到问题可在 [GitHub Issues](https://github.com/hwc-cell/opencode-lychee/issues) 中反馈，并附上系统版本、复现步骤与脱敏后的错误日志。

## 致谢与许可

|          |                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------ |
| 上游项目 | [anomalyco/opencode](https://github.com/anomalyco/opencode) · [opencode.ai](https://opencode.ai) |
| 改造者   | [hwc-cell 的 Bilibili](https://space.bilibili.com/3493128967293256)                              |

本 fork 保留原始 MIT 协议及上游版权声明，详见 [LICENSE](LICENSE)。
