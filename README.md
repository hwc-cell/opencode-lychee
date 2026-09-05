<p align="center">
  <picture>
    <source srcset="packages/ui/src/assets/favicon/lychee.png" media="(prefers-color-scheme: dark)">
    <img src="packages/ui/src/assets/favicon/lychee.png" alt="OpenCode-Lychee logo" width="180">
  </picture>
</p>

<h1 align="center">OpenCode-Lychee 🍈</h1>

<p align="center">
  <em>由 <a href="https://github.com/anomalyco/opencode">OpenCode</a> 改造而来的 AI 编码代理 —— 一张中文脸。</em>
</p>

<p align="center">
  <a href="README.en.md">English</a> ·
  <a href="https://github.com/anomalyco/opencode">源项目</a>
</p>

---

## 这是什么?

**OpenCode-Lychee(荔枝)** 是基于开源 AI 编码代理 [OpenCode](https://github.com/anomalyco/opencode)(MIT 协议,opencode 社区维护)改写的中文本地化衍生版本。

### 我们新增的能力

- 🇨🇳 **中文界面** —— 终端界面、命令面板、权限弹窗、帮助文本、CLI 输出全部中文化(检测到 `LANG=zh_CN*` 或设置 `OPENCODE_LANG=zh` 自动生效)
- 🍈 **荔枝品牌** —— 终端里真彩色渲染的荔枝图标 + 像素字画
- ℹ️ **`/about` 命令** —— 随时查看本项目出处与改造者
- 🍈 **荔枝小结** —— 会话关闭时自动用你当前的 AI 生成中文总结卡片,保存到 `.opencode/reports/`(`/summary` 开关)
- 💸 **自动记账** —— 会话结束自动把本次 AI 成本记进[荔枝记账](https://lycheeledger.cn)(`/autolychee` 开关,密钥用 `/ledger-key` 保存)
- 🚀 **快捷启动** —— 终端输入 `OpenCode-Lychee`(或 `lychee`)即可打开
- 💬 **聊天桥** —— 把微信等聊天软件接入荔枝 AI(`lychee weixin login/run`);聊天指令 `/autostart`、`/autostop`、`/halp` 是**通道通用**的核心能力,任何新聊天平台适配器接入即自动获得(见 `packages/bridge/README.md`)
- ⚡️ **超时重试 & 打断通知** —— 模型超时自动重试并提示「⚡️模型超时,已尝试X/3次」;新消息打断时提示「⚡️已打断,当前运行:…」;运行中每 5 分钟提醒「⏱️ 依然在工作,已工作X分钟」;桥内所有文案按 `OPENCODE_LANG` 中英切换

其余一切——会话引擎、插件系统、工具注册表、模型兼容性——全部继承自上游 OpenCode,并保持同步。

## 出品信息

| | |
|---|---|
| 源项目 | [anomalyco/opencode](https://github.com/anomalyco/opencode) · [opencode.ai](https://opencode.ai) |
| 改造者 | [hwc-cell 的 Bilibili](https://space.bilibili.com/3493128967293256) |

本 fork 保留原始 MIT 协议及上游全部版权声明,详见 [LICENSE](LICENSE)。

## 从源码构建

```bash
git clone https://github.com/hwc-cell/opencode-lychee.git
cd opencode-lychee
bun install
cd packages/opencode && bun run dev   # 启动 TUI
```

> 需要 [bun](https://bun.sh)。配置、插件、供应商等用法沿用上游文档。
