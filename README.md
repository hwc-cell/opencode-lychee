<h1 align="center">OpenCode-Lychee 🍈</h1>

<p align="center">
  <strong>面向中文开发者的 OpenCode 社区衍生版</strong><br>
  基于 OpenCode v2，加入微信桥、荔枝主题、会话小结与 macOS 语音输入
</p>

<p align="center">
  <a href="使用说明.md">完整使用说明</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="使用说明.md#tui-navigation">快捷键与跳转</a> ·
  <a href="使用说明.md#wechat">微信接入</a> ·
  <a href="https://github.com/anomalyco/opencode">上游 OpenCode</a>
</p>

---

OpenCode-Lychee 在尽量保持 OpenCode v2 架构、会话引擎、插件系统和模型兼容性的前提下，增加适合中文日常使用的扩展。它是社区维护的 fork，并非 OpenCode、腾讯或微信的官方发行版。

## 主要功能

| 功能           | 说明                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| 微信聊天桥     | 扫码连接微信 iLink Bot，支持流式回复、媒体附件、会话控制、模型切换和 macOS 后台常驻      |
| 荔枝小结       | `/summary`（兼容 `/lycheexj`）控制退出 TUI 时的中文会话小结，保存到 `.opencode/reports/` |
| 成本记账       | `/autolychee` 可在退出 TUI 时把本次 AI 成本同步到荔枝记账                                |
| 荔枝主题       | 荔枝、晴空、汽水、青瓷、中国红、桂月主题均为独立内置主题，不覆盖上游主题                 |
| macOS 语音输入 | 按住左 Command 录音，松开后用本地 whisper.cpp 转写                                       |
| 上游兼容       | 保留 OpenCode v2 CLI、后台服务、插件、模型与会话能力                                     |

## 快速开始

需要 Git 和 [Bun](https://bun.sh/)；仓库当前声明的 Bun 版本见根目录 `package.json`。

```bash
git clone https://github.com/hwc-cell/opencode-lychee.git
cd opencode-lychee
bun install
bun run dev
```

### 安装快捷命令

在仓库根目录执行：

```bash
mkdir -p ~/.local/bin
ln -sfn "$PWD/packages/cli/lychee.sh" ~/.local/bin/OpenCode-Lychee
ln -sfn "$PWD/packages/cli/lychee.sh" ~/.local/bin/lychee
```

随后进入任意项目目录运行：

```bash
OpenCode-Lychee
```

启动器直接链接当前源码仓库；移动仓库后需要重新创建链接。它默认关闭上游自动更新，避免官方包覆盖 fork 功能。

## 微信接入

```bash
OpenCode-Lychee weixin login
OpenCode-Lychee weixin configure
OpenCode-Lychee weixin autostart   # macOS 后台常驻
```

非 macOS 可使用 `OpenCode-Lychee weixin run` 前台运行。常用管理命令：

| 命令                            | 用途                             |
| ------------------------------- | -------------------------------- |
| `weixin run`                    | 启动聊天桥                       |
| `weixin status`                 | 查看登录、常驻服务和连接状态     |
| `weixin configure`              | 选择默认模型与思考强度           |
| `weixin autostart` / `autostop` | 安装或移除 macOS 常驻服务        |
| `weixin logout`                 | 清除本地微信登录、会话和连接状态 |

微信内支持 `/model`、`/new`、`/clear`、`/stop`、`/status`、`/where`、`/autostart`、`/autostop` 和 `/help`。媒体只从受信任的微信 CDN 下载并在内存中解密；默认单附件 10MB、单消息合计 20MB。

微信登录凭证保存在 `~/.local/state/opencode/weixin.json`。不要提交、截图或分享 API Key、登录凭证、加密密钥和状态文件。

## 主题与小结

在 TUI 中使用 `/themes` 选择：

- `lychee`
- `lychee-clear-sky`
- `lychee-soda`
- `lychee-celadon`
- `lychee-china-red`
- `lychee-osmanthus-moon`

输入 `/summary` 或 `/lycheexj` 开关荔枝小结。开启后退出 TUI 会生成中文 Markdown，小结保存在当前项目 `.opencode/reports/`。

输入 `/ledger-key` 设置荔枝记账 API Key，再用 `/autolychee` 开关会话成本同步。Key 只保存在本机 `~/.local/state/opencode/ledger.json`，不会写入项目。

## macOS 语音输入

```bash
OpenCode-Lychee voice install
OpenCode-Lychee voice authorize
OpenCode-Lychee voice test
```

安装会使用 `whisper.cpp` 并下载本地模型；需要 Xcode Command Line Tools、麦克风权限与辅助功能权限。可通过 `--model tiny|base|small` 选择模型。

## 更多说明

- [完整使用说明](使用说明.md)：安装、页面跳转、命令、快捷键、微信、主题、语音和排错。
- [微信桥开发说明](packages/bridge/README.md)
- [荔枝主题色板](docs/lychee-theme-palettes.md)
- [上游 OpenCode 文档](https://opencode.ai/docs)

## 与上游的关系

本项目持续跟进 [anomalyco/opencode](https://github.com/anomalyco/opencode) 的 `dev` 分支。OpenCode 的配置、插件和模型文档通常仍适用；荔枝扩展以本仓库说明为准。

本 fork 保留上游 MIT 协议与版权声明，详见 [LICENSE](LICENSE)。
