<p align="center">
  <picture>
    <source srcset="packages/ui/src/assets/favicon/lychee.png" media="(prefers-color-scheme: dark)">
    <img src="packages/ui/src/assets/favicon/lychee.png" alt="OpenCode-Lychee logo" width="180">
  </picture>
</p>

<h1 align="center">OpenCode-Lychee 🍈</h1>

<p align="center">
  <em>The AI coding agent derived from <a href="https://github.com/anomalyco/opencode">OpenCode</a> — with a Chinese face.</em>
</p>

<p align="center">
  <a href="README.md">简体中文</a> ·
  <a href="https://github.com/anomalyco/opencode">Upstream Project</a>
</p>

---

## What is this?

**OpenCode-Lychee** is a fork of the open source AI coding agent [OpenCode](https://github.com/anomalyco/opencode) (MIT licensed, maintained by the opencode community), rebranded and localized for Chinese developers.

### Features we added

- 🇨🇳 **Chinese UI** — the terminal interface, command palette, permission dialogs, help text and CLI output are fully localized in Chinese (auto-detected via `LANG=zh_CN*` or `OPENCODE_LANG=zh`).
- 🍈 **Lychee branding** — a true-color lychee icon rendered in the terminal, plus a pixel wordmark.
- ℹ️ **`/about` command** — find out where this project came from and who built it.
- 🚀 **Quick launch** — type `OpenCode-Lychee` (or `lychee`) in your terminal to start.

Everything else — the session engine, plugin system, tool registry, model compatibility — comes straight from upstream OpenCode and stays in sync with it.

## Credits

| | |
|---|---|
| Upstream project | [anomalyco/opencode](https://github.com/anomalyco/opencode) · [opencode.ai](https://opencode.ai) |
| Modified by | [hwc-cell on Bilibili](https://space.bilibili.com/3493128967293256) |

This fork keeps the original MIT license and all upstream copyright notices. See [LICENSE](LICENSE).

## Building from source

```bash
git clone https://github.com/hwc-cell/opencode-lychee.git
cd opencode-lychee
bun install
cd packages/opencode && bun run dev   # start the TUI
```

> Requires [bun](https://bun.sh). The upstream docs remain valid for configuration, plugins, and providers.
