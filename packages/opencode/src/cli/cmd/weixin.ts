import type { Argv, CommandModule } from "yargs"
import { UI } from "../ui"
import { chunkText, getQr, loginUntilConfirmed, sendText } from "@opencode-ai/bridge"
import { readState, writeState, type WeixinState } from "@opencode-ai/bridge"

const LoginCommand: CommandModule = {
  command: "login",
  describe: "扫码登录微信 Bot",
  handler: async () => {
    const { qrcode_img_content } = await getQr()
    UI.print("📱 用微信扫码登录(或打开):")
    UI.println(qrcode_img_content)
    UI.println("")
    // 二维码直接渲染在终端(两字符宽一个像素)
    const { qrTerminal } = await import("@opencode-ai/bridge")
    const art = await qrTerminal(qrcode_img_content)
    UI.println(art)
    UI.println("等待扫码确认…")

    const cred = await loginUntilConfirmed({
      onStage: (stage) => {
        if (stage.status === "scaned") UI.println("✅ 已扫码, 请在手机上确认…")
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
  },
}

const RunCommand: CommandModule = {
  command: "run",
  describe: "启动微信 Bot 桥(长轮询收发消息)",
  builder: (yargs: Argv) =>
    yargs
      .option("dir", { type: "string", default: process.cwd(), describe: "AI 工作目录" })
      .option("server", { type: "string", describe: "OpenCode 服务器地址(默认自动启动)" }),
  handler: async (argv) => {
    const state = readState()
    if (!state.credential) {
      console.error("未登录, 请先运行: lychee weixin login")
      process.exit(1)
    }
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
      dir: String(argv.dir),
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

export const WeixinCommand: CommandModule = {
  command: "weixin",
  describe: "微信 Bot 接入(扫码登录 / 消息桥)",
  builder: (yargs: Argv) => {
    return yargs.command(LoginCommand).command(RunCommand).command(StatusCommand).demandCommand()
  },
  handler: () => undefined,
}
