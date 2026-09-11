import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync } from "node:fs"
import type { Argv, CommandModule } from "yargs"
import { UI } from "../ui"
import { createInterface } from "node:readline/promises"
import { AUTH_PROFILES } from "@opencode-ai/core/catalog"
import { autoStartStatus, clearState, installAutoStart, loginUntilConfirmed, removeAutoStart } from "@opencode-ai/bridge"
import { t as bridgeT } from "@opencode-ai/bridge"
import { readState, writeState, type WeixinState } from "@opencode-ai/bridge"

function readAuthKeys(): Array<{ providerID: string; token: string }> {
  try {
    const auth = JSON.parse(require("node:fs").readFileSync(join(homedir(), ".local", "share", "opencode", "auth.json"), "utf8")) as Record<
      string,
      { type?: string; key?: string }
    >
    return Object.entries(auth)
      .filter(([, v]) => v?.type === "api" && v.key)
      .map(([providerID, v]) => ({ providerID, token: v.key! }))
  } catch {
    return []
  }
}

function modelCandidates() {
  const auth = readAuthKeys()
  const list: Array<{ id: string; providerID: string; name: string; variants?: string[] }> = []
  for (const { providerID } of auth) {
    const profile = AUTH_PROFILES[providerID]
    if (!profile) continue
    for (const m of profile.models) list.push({ id: m.id, providerID, name: m.name, variants: m.variants ?? [] })
  }
  // 兜底: opencode 免费模型(无需密钥)
  list.push({ id: "muse-spark-1.3-contributor-free", providerID: "opencode", name: "Muse Spark 1.3 Free (免费)" })
  return list
}

const ask = async (question: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const value = await rl.question(question)
  rl.close()
  return value.trim()
}

function isProcessRunning(pid?: number): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function handleConfigure(): Promise<void> {
  const candidates = modelCandidates()
  console.log("🍈 配置默认模型(微信 /model 可随时切换):")
  candidates.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.name}  (${m.providerID}/${m.id})${m.variants?.length ? `  [强度: ${m.variants.join("/")}]` : ""}`)
  })
  const raw = await ask("输入编号: ")
  const model = candidates[Number(raw) - 1]
  if (!model) {
    console.log("❌ 没有选中, 未修改配置")
    return
  }
  let variant: string | undefined
  if (model.variants?.length) {
    const v = await ask("思考强度(直接回车 = 默认): ")
    if (v && model.variants.includes(v)) variant = v
  }
  const state = readState()
  state.model = { id: model.id, providerID: model.providerID, ...(variant ? { variant } : {}) }
  writeState(state)
  console.log(`✅ 默认模型已配置: ${model.name}${variant ? `(强度:${variant})` : ""}`)
  console.log("· 现在可以启动桥: OpenCode-Lychee weixin autostart(常驻)或 OpenCode-Lychee weixin run")
}

const ConfigureCommand: CommandModule = {
  command: "configure",
  describe: "配置默认 AI 模型(扫码后必配; 未配置时微信会引导)",
  handler: () => handleConfigure(),
}

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
      onQr: showQr,
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
    state.inbox = {}
    state.contexts = {}
    state.health = { status: "stopped", updatedAt: new Date().toISOString() }
    writeState(state)
    UI.println(`🎉 登录成功: ${cred.botId}`)
    UI.println("")
    // 配置模型后才可用(未配置的新账号扫码完直接进入配置界面)
    if (!state.model) {
      UI.println("👇 首次使用: 请配置默认 AI 模型(配置后才能用):")
      await handleConfigure()
    }
    if (autoStartStatus("weixin").installed) {
      const current = readState()
      const result = installAutoStart("weixin", current.workDir ?? process.cwd(), bridgeT)
      UI.println(`${result.ok ? "✅" : "⚠️"} 已刷新后台服务: ${result.message}`)
    }
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
      console.error("未登录, 请先运行: OpenCode-Lychee weixin login")
      process.exit(1)
    }
    const dir = String(argv.dir ?? state.workDir ?? process.cwd())
    state.workDir = dir
    writeState(state)
    if (!state.model) console.log("⚠️ 尚未配置默认模型, 微信发消息会被引导: 先运行 OpenCode-Lychee weixin configure")
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
  describe: "查看微信 Bot 登录与连接状态",
  handler: () => {
    const state = readState()
    const daemon = autoStartStatus("weixin")
    if (!state.credential) {
      console.log("登录: 未登录")
    } else {
      console.log(`登录: 已登录 (${state.credential.accountId})`)
      console.log(`登录时间: ${state.credential.savedAt}`)
    }
    const daemonLabel = daemon.running
      ? `运行中${daemon.pid ? ` (PID ${daemon.pid})` : ""}`
      : daemon.loaded
        ? "已加载, 当前未运行"
        : daemon.installed
          ? "已安装, 当前未加载"
          : "未安装"
    console.log(`后台常驻: ${daemonLabel}`)
    const health = state.health
    if (!health) {
      console.log("连接: 尚未启动")
    } else {
      const age = Date.now() - Date.parse(health.updatedAt)
      const alive = isProcessRunning(health.pid)
      const fresh = Number.isFinite(age) && age < 120_000
      const labels = { starting: "启动中", online: "在线", offline: "网络异常", expired: "登录失效", stopped: "已停止" } as const
      const suffix = (health.status === "online" || health.status === "starting") && (!alive || !fresh) ? " (状态已过期)" : ""
      console.log(`连接: ${labels[health.status]}${suffix}${health.pid && alive ? ` (PID ${health.pid})` : ""}`)
      console.log(`状态更新时间: ${health.updatedAt}`)
      if (health.lastInboundAt) console.log(`最近收消息: ${health.lastInboundAt}`)
      if (health.lastOutboundAt) console.log(`最近发消息: ${health.lastOutboundAt}`)
      if (health.lastError) console.log(`最近错误: ${health.lastError}`)
    }
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
      console.log("❌ 未登录, 先运行: OpenCode-Lychee weixin login")
      return
    }
    const dir = state.workDir ?? process.cwd()
    if (!existsSync(dir)) {
      console.log(`❌ AI 工作目录不存在: ${dir}`)
      return
    }
    state.workDir = dir
    writeState(state)
    const result = installAutoStart("weixin", dir, bridgeT)
    console.log(`${result.ok ? "✅" : "⚠️"} ${result.message}`)
    if (result.ok) console.log("· 停止常驻: OpenCode-Lychee weixin autostop")
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

const LogoutCommand: CommandModule = {
  command: "logout",
  describe: "退出微信 Bot 并清除本地登录状态",
  handler: () => {
    const result = removeAutoStart("weixin", bridgeT)
    clearState()
    console.log("✅ 已清除微信登录、会话和连接状态")
    if (!result.ok) console.log(`⚠️ ${result.message}; 运行中的桥检测到凭证变化后仍会自行退出`)
  },
}

export const WeixinCommand: CommandModule = {
  command: "weixin",
  describe: "微信 Bot 接入(扫码登录 / 消息桥)",
  builder: (yargs: Argv) => {
    return yargs
      .command(LoginCommand)
      .command(ConfigureCommand)
      .command(RunCommand)
      .command(StatusCommand)
      .command(AutostartCommand)
      .command(AutostopCommand)
      .command(LogoutCommand)
  },
  handler: () => {
    const state = readState()
    if (state.credential) {
      console.log(`已登录: ${state.credential.accountId}`)
      console.log("下一步: OpenCode-Lychee weixin run 启动消息桥")
    } else {
      console.log("未登录微信 Bot")
      console.log("用法: OpenCode-Lychee weixin login | configure | run | status | autostart | autostop | logout")
    }
  },
}
