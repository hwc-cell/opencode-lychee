import type { Argv, CommandModule } from "yargs"
import { UI } from "../ui"
import { chunkText, installAutoStart, loginUntilConfirmed, removeAutoStart, sendText } from "@opencode-ai/bridge"
import { t as bridgeT } from "@opencode-ai/bridge"
import { readState, writeState, type WeixinState } from "@opencode-ai/bridge"

const LoginCommand: CommandModule = {
  command: "login",
  describe: "扫码登录微信 Bot",
  handler: async () => {
    let lastStageLabel = ""
    const { qrTerminal } = await import("@opencode-ai/bridge")
    const showQr = async (qr: { qrcode_img_content: string }) => {
      UI.print("📱 用微信扫码登录(或打开):")
      UI.println(qr.qrcode_img_content)
      UI.println("")
      const art = await qrTerminal(qr.qrcode_img_content)
      UI.println(art)
      UI.println("等待扫码确认…")
    }
    UI.println("")
    UI.println("⚠️ 免责声明:")
    UI.println("· 本功能基于腾讯微信 iLink Bot(ClawBot)官方接口, 实际行为以腾讯官方为准;")
    UI.println("· 扫码即授权 Bot 收发消息, 请仅使用你自己有权使用的微信账号;")
    UI.println("· 登录凭证保存在 ~/.local/state/opencode/weixin.json, 请勿泄露给他人;")
    UI.println("· 微信平台策略可能变化, 账号受限 / 功能失效等风险请自行承担;")
    UI.println("· 本项目与腾讯 / 微信官方无任何关联。")

    const cred = await loginUntilConfirmed({
      onQr: (qr) => void showQr(qr),
      onStage: (stage) => {
        // 二维码轮询是 ~30s 长轮询, 只在阶段变化时提示, 避免刷屏
        const label =
          stage.status === "scaned"
            ? "✅ 已扫码, 请在手机上确认…"
            : stage.status === "scaned_but_redirect"
              ? "✅ 已扫码(握手切换中)…"
              : stage.status === "wait"
                ? "📱 等待扫码…"
                : undefined
        if (label && label !== lastStageLabel) {
          UI.println(label)
          lastStageLabel = label
        }
      },
    })
    const state: WeixinState = readState()
    state.credential = {
      token: cred.token,
      baseUrl: cred.baseUrl,
      accountId: cred.botId,
      userId: cred.userId,
      savedAt: new Date().toISOString(),
    }
    state.cursor = ""
    writeState(state)
    UI.println(`🎉 登录成功: ${cred.botId}`)
    UI.println("")
    UI.println("接下来:")
    UI.println("  → 一键常驻(推荐, 开机自启+崩溃重启): OpenCode-Lychee weixin autostart")
    UI.println("  → 或临时运行: OpenCode-Lychee weixin run")
    UI.println("  → 然后直接在微信里给这个 Bot 发消息即可对话")
  },
}

const RunCommand: CommandModule = {
  command: "run",
  describe: "启动微信 Bot 桥(长轮询收发消息)",
  builder: (yargs: Argv) =>
    yargs
      .option("dir", { type: "string", describe: "AI 工作目录(默认记住上次使用的)" })
      .option("server", { type: "string", describe: "OpenCode 服务器地址(默认自动启动)" }),
  handler: async (argv) => {
    const state = readState()
    if (!state.credential) {
      console.error("未登录, 请先运行: lychee weixin login")
      process.exit(1)
    }
    const dir = String(argv.dir ?? state.workDir ?? process.cwd())
    state.workDir = dir
    writeState(state)
    console.log(`🤖 AI 工作目录: ${dir}`)
    let serverUrl: string
    const provided = (argv.server as string | undefined) ?? process.env.OPENCODE_SERVER_URL
    if (provided) {
      serverUrl = provided
    } else {
      const { Server } = await import("../../server/server")
      const server = await Server.listen({ port: 0, hostname: "127.0.0.1" })
      serverUrl = server.url.toString()
      console.log(`opencode server listening on ${serverUrl}`)
    }
    const { runWeixinBridge } = await import("@opencode-ai/bridge")
    await runWeixinBridge({
      serverUrl,
      dir,
      log: (msg) => console.log(msg),
    })
  },
}

const StatusCommand: CommandModule = {
  command: "status",
  describe: "查看微信 Bot 登录状态",
  handler: () => {
    const state = readState()
    if (!state.credential) {
      console.log("未登录")
      return
    }
    console.log(`已登录: ${state.credential.accountId}`)
    console.log(`登录时间: ${state.credential.savedAt}`)
    const sessions = Object.keys(state.sessions ?? {}).length
    console.log(`映射会话数: ${sessions}`)
  },
}

const AutostartCommand: CommandModule = {
  command: "autostart",
  describe: "安装后台常驻(launchd: 开机自启 + 崩溃重启)",
  handler: () => {
    const state = readState()
    if (!state.credential) {
      console.log("❌ 未登录, 先运行: lychee weixin login")
      return
    }
    const dir = state.workDir ?? process.cwd()
    state.workDir = dir
    writeState(state)
    const result = installAutoStart("weixin", dir, bridgeT)
    console.log(`${result.ok ? "✅" : "⚠️"} ${result.message}`)
    if (result.ok) console.log("· 停止常驻: lychee weixin autostop")
  },
}

const AutostopCommand: CommandModule = {
  command: "autostop",
  describe: "移除后台常驻",
  handler: () => {
    const result = removeAutoStart("weixin", bridgeT)
    console.log(`${result.ok ? "✅" : "⚠️"} ${result.message}`)
  },
}

export const WeixinCommand: CommandModule = {
  command: "weixin",
  describe: "微信 Bot 接入(扫码登录 / 消息桥)",
  builder: (yargs: Argv) => {
    return yargs.command(LoginCommand).command(RunCommand).command(StatusCommand).command(AutostartCommand).command(AutostopCommand)
  },
  handler: () => {
    const state = readState()
    if (state.credential) {
      console.log(`已登录: ${state.credential.accountId}`)
      console.log("下一步: OpenCode-Lychee weixin run 启动消息桥")
    } else {
      console.log("未登录微信 Bot")
      console.log("用法: OpenCode-Lychee weixin login | run | status")
    }
  },
}
