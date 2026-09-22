<p align="center">
  <picture>
    <source srcset="packages/ui/src/assets/favicon/lychee.png" media="(prefers-color-scheme: dark)">
    <img src="packages/ui/src/assets/favicon/lychee.png" alt="OpenCode-Lychee logo" width="180">
  </picture>
</p>

<h1 align="center">OpenCode-Lychee 🍈</h1>

<p align="center">
  <strong>An OpenCode distribution tailored for Chinese-speaking developers</strong><br>
  Chinese localization, WeChat integration, session summaries, cost tracking, and macOS voice input
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#wechat-integration">WeChat</a> ·
  <a href="README.md">简体中文</a> ·
  <a href="https://github.com/anomalyco/opencode">Upstream</a>
</p>

---

## What is OpenCode-Lychee?

OpenCode-Lychee is a community-maintained derivative of the open-source AI coding agent [OpenCode](https://github.com/anomalyco/opencode). It keeps the upstream session engine, plugin system, tools, and model compatibility while adding Chinese localization and features for everyday use.

This project is not an official distribution of OpenCode, Tencent, or WeChat.

## Highlights

| Feature                       | Description                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Chinese experience            | Localized core TUI, command palette, permission dialogs, help, and CLI output                                          |
| WeChat bridge                 | Connect a WeChat Bot by QR code, stream replies, switch models and reasoning intensity, and run in the background      |
| Reliable delivery             | Persistent inbound queue, reconnect recovery, isolated group sessions, and safeguards against duplicate turn execution |
| Lychee Summary                | Generate a Chinese session summary in `.opencode/reports/` when a session closes                                       |
| Cost tracking                 | Record session AI costs in [Lychee Ledger](https://lycheeledger.cn)                                                    |
| Authenticated model discovery | Add providers configured in the local `auth.json` to model selection automatically                                     |
| macOS voice input             | Hold left Command to speak, then transcribe locally with Whisper into the prompt                                       |
| Lychee identity               | Terminal artwork and an `/about` project information page                                                              |

## Quick start

Requirements: [Git](https://git-scm.com/) and [Bun](https://bun.sh/) (the repository currently recommends Bun `1.3.14`).

```bash
git clone https://github.com/hwc-cell/opencode-lychee.git
cd opencode-lychee
bun install
bun run dev
```

To install the optional source launcher, run this from the repository root:

```bash
mkdir -p ~/.local/bin
ln -sfn "$PWD/packages/opencode/lychee.sh" ~/.local/bin/OpenCode-Lychee
```

Make sure `~/.local/bin` is in your `PATH`. You can then enter any project directory and run `OpenCode-Lychee`. The launcher links to this checkout, so recreate the link if the repository is moved.

## WeChat integration

```bash
OpenCode-Lychee weixin login       # scan the QR code; first login continues to model setup
OpenCode-Lychee weixin configure   # optional: change the default model and reasoning intensity
OpenCode-Lychee weixin autostart   # macOS: start on login and restart after a crash
```

Use `OpenCode-Lychee weixin run` for foreground operation, `status` to inspect the real connection state, `autostop` to remove the macOS service, and `logout` to clear local login and session state.

Inside WeChat, use `/model` to select models, `/new` or `/clear` to manage the conversation, `/stop` to interrupt work, `/status` to inspect the current state, `/where [directory]` to inspect or change the AI working directory, and `/help` for help. The legacy `/halp` spelling remains supported.

The bridge accepts text, WeChat voice transcripts, images, files, and video attachments. Media is downloaded only from trusted WeChat CDN hosts, decrypted in memory, and limited to 10MB per attachment and 20MB per message by default (`LYCHEE_MEDIA_MAX_BYTES` and `LYCHEE_MEDIA_TOTAL_MAX_BYTES` override the limits).

The bridge streams model output and reports progress every five minutes by default. A new message can interrupt an active task. If the waiting connection drops, it reconnects safely; if the model reaches the overall timeout, the turn is stopped and reported without resubmitting the full request, preventing duplicate tool actions.

See [`packages/bridge/README.md`](packages/bridge/README.md) for adapter development details.

> The integration uses Tencent's WeChat iLink Bot (ClawBot) interface. Scanning the QR code authorizes the Bot to send and receive messages. Platform policies and capabilities can change; only use an account you are authorized to operate.

## Lychee TUI commands

| Command       | Purpose                                        |
| ------------- | ---------------------------------------------- |
| `/about`      | Show project origin and maintainer information |
| `/summary`    | Toggle automatic end-of-session summaries      |
| `/autolychee` | Toggle automatic session cost tracking         |
| `/ledger-key` | Store the Lychee Ledger API key                |

On macOS, install local voice input with:

```bash
OpenCode-Lychee voice install
```

This requires Xcode Command Line Tools and installs or invokes `whisper.cpp`, downloads a local model, and then guides you through Accessibility and microphone permissions.

## Language

Source runs follow `LANG` automatically. You can override it explicitly:

```bash
OPENCODE_LANG=zh bun run dev
OPENCODE_LANG=en bun run dev
```

The `OpenCode-Lychee` launcher defaults to Chinese. Run `LYCHEE_LANG=en OpenCode-Lychee` for English.

## Local data and secrets

- WeChat credentials are stored in `~/.local/state/opencode/weixin.json` with owner-only file permissions.
- Model credentials use OpenCode's local authentication store and are not written into project source or ordinary configuration files.
- Never commit, screenshot, or share API keys, login credentials, or state files. Revoke and rotate any secret that has been exposed.

## Upstream and support

This project regularly merges changes from [anomalyco/opencode](https://github.com/anomalyco/opencode). Upstream documentation for configuration, plugins, and model providers generally remains applicable. When a Lychee extension behaves differently, follow this repository's documentation.

Report problems through [GitHub Issues](https://github.com/hwc-cell/opencode-lychee/issues) with your OS version, reproduction steps, and redacted logs.

## Credits and license

|             |                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Upstream    | [anomalyco/opencode](https://github.com/anomalyco/opencode) · [opencode.ai](https://opencode.ai) |
| Modified by | [hwc-cell on Bilibili](https://space.bilibili.com/3493128967293256)                              |

This fork preserves the original MIT license and upstream copyright notices. See [LICENSE](LICENSE).
