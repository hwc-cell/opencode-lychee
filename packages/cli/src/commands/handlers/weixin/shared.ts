import {
  autoStartStatus,
  clearState,
  installAutoStart,
  loginUntilConfirmed,
  qrTerminal,
  readState,
  removeAutoStart,
  runWeixinBridge,
  t as bridgeT,
  writeState,
  type WeixinState,
} from "@opencode/bridge"
import { OpenCode } from "@opencode/client"
import { createInterface } from "node:readline/promises"
import { existsSync } from "node:fs"

type Client = ReturnType<typeof OpenCode.make>

const ask = async (question: string) => {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const value = await prompt.question(question)
  prompt.close()
  return value.trim()
}

function isProcessRunning(pid?: number) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function summary() {
  const state = readState()
  if (state.credential) {
    console.log(`已登录: ${state.credential.accountId}`)
    console.log("下一步: OpenCode-Lychee weixin run 启动消息桥")
    return
  }
  console.log("未登录微信 Bot")
  console.log("用法: OpenCode-Lychee weixin login | configure | run | status | autostart | autostop | logout")
}

export async function configure(client: Client) {
  const response = await client.model.list({ location: { directory: process.cwd() } })
  const models = response.data.filter((model) => model.enabled)
  if (!models.length) {
    console.log("❌ 当前 OpenCode 服务没有可用模型，请先完成模型登录或配置")
    return
  }

  console.log("🍈 配置默认模型（微信 /model 可随时切换）:")
  models.forEach((model, index) => {
    const variants = model.variants.map((variant) => variant.id)
    console.log(
      `  ${index + 1}. ${model.name}  (${model.providerID}/${model.id})${variants.length ? `  [强度: ${variants.join("/")}]` : ""}`,
    )
  })
  const selected = models[Number(await ask("输入编号: ")) - 1]
  if (!selected) {
    console.log("❌ 没有选中，未修改配置")
    return
  }

  const variants = selected.variants.map((variant) => variant.id)
  const requested = variants.length ? await ask("思考强度（直接回车 = 默认）: ") : ""
  const variant = variants.includes(requested) ? requested : undefined
  const state = readState()
  state.model = { id: selected.id, providerID: selected.providerID, ...(variant ? { variant } : {}) }
  writeState(state)
  console.log(`✅ 默认模型已配置: ${selected.name}${variant ? `（强度: ${variant}）` : ""}`)
  console.log("· 现在可以启动桥: OpenCode-Lychee weixin autostart（常驻）或 OpenCode-Lychee weixin run")
}

export async function login(client: Client) {
  let lastStageLabel = ""
  const showQr = async (qr: { qrcode_img_content: string }) => {
    console.log(`📱 用微信扫码登录（或打开）: ${qr.qrcode_img_content}\n`)
    console.log(await qrTerminal(qr.qrcode_img_content))
    console.log("等待扫码确认…")
  }

  console.log("\n⚠️ 免责声明:")
  console.log("· 本功能基于腾讯微信 iLink Bot（ClawBot）官方接口，实际行为以腾讯官方为准；")
  console.log("· 扫码即授权 Bot 收发消息，请仅使用你自己有权使用的微信账号；")
  console.log("· 登录凭证保存在 ~/.local/state/opencode/weixin.json，请勿泄露给他人；")
  console.log("· 微信平台策略可能变化，账号受限或功能失效等风险请自行承担；")
  console.log("· 本项目与腾讯或微信官方无任何关联。")

  const credential = await loginUntilConfirmed({
    onQr: showQr,
    onStage: (stage) => {
      const label =
        stage.status === "scaned"
          ? "✅ 已扫码，请在手机上确认…"
          : stage.status === "scaned_but_redirect"
            ? "✅ 已扫码（握手切换中）…"
            : stage.status === "wait"
              ? "📱 等待扫码…"
              : undefined
      if (!label || label === lastStageLabel) return
      console.log(label)
      lastStageLabel = label
    },
  })
  const state: WeixinState = readState()
  state.credential = {
    token: credential.token,
    baseUrl: credential.baseUrl,
    accountId: credential.botId,
    userId: credential.userId,
    savedAt: new Date().toISOString(),
  }
  state.cursor = ""
  state.inbox = {}
  state.contexts = {}
  state.health = { status: "stopped", updatedAt: new Date().toISOString() }
  writeState(state)
  console.log(`🎉 登录成功: ${credential.botId}\n`)
  if (!state.model) {
    console.log("👇 首次使用：请配置默认 AI 模型（配置后才能用）:")
    await configure(client)
  }
  if (autoStartStatus("weixin").installed) {
    const current = readState()
    const result = installAutoStart("weixin", current.workDir ?? process.cwd(), bridgeT)
    console.log(`${result.ok ? "✅" : "⚠️"} 已刷新后台服务: ${result.message}`)
  }
  console.log("接下来:")
  console.log("  → 一键常驻（推荐，开机自启+崩溃重启）: OpenCode-Lychee weixin autostart")
  console.log("  → 或临时运行: OpenCode-Lychee weixin run")
  console.log("  → 然后直接在微信里给这个 Bot 发消息即可对话")
}

export async function run(options: { serverUrl: string; headers?: HeadersInit; dir?: string }) {
  const state = readState()
  if (!state.credential) throw new Error("未登录，请先运行: OpenCode-Lychee weixin login")
  const daemon = process.platform === "darwin" && process.ppid === 1
  const dir = daemon ? (state.workDir ?? options.dir ?? process.cwd()) : (options.dir ?? state.workDir ?? process.cwd())
  if (state.workDir && state.workDir !== dir) state.sessions = {}
  state.workDir = dir
  writeState(state)
  if (!state.model) console.log("⚠️ 尚未配置默认模型，请先运行 OpenCode-Lychee weixin configure")
  console.log(`🤖 AI 工作目录: ${dir}`)
  await runWeixinBridge({ serverUrl: options.serverUrl, headers: options.headers, dir, log: console.log })
}

export function status() {
  const state = readState()
  const daemon = autoStartStatus("weixin")
  if (!state.credential) console.log("登录: 未登录")
  if (state.credential) {
    console.log(`登录: 已登录 (${state.credential.accountId})`)
    console.log(`登录时间: ${state.credential.savedAt}`)
  }
  const daemonLabel = daemon.running
    ? `运行中${daemon.pid ? ` (PID ${daemon.pid})` : ""}`
    : daemon.loaded
      ? "已加载，当前未运行"
      : daemon.installed
        ? "已安装，当前未加载"
        : "未安装"
  console.log(`后台常驻: ${daemonLabel}`)
  const health = state.health
  if (!health) console.log("连接: 尚未启动")
  if (health) {
    const alive = isProcessRunning(health.pid)
    const fresh =
      Number.isFinite(Date.now() - Date.parse(health.updatedAt)) && Date.now() - Date.parse(health.updatedAt) < 120_000
    const labels = { starting: "启动中", online: "在线", offline: "网络异常", expired: "登录失效", stopped: "已停止" }
    const suffix =
      (health.status === "online" || health.status === "starting") && (!alive || !fresh) ? "（状态已过期）" : ""
    console.log(`连接: ${labels[health.status]}${suffix}${health.pid && alive ? ` (PID ${health.pid})` : ""}`)
    console.log(`状态更新时间: ${health.updatedAt}`)
    if (health.lastInboundAt) console.log(`最近收消息: ${health.lastInboundAt}`)
    if (health.lastOutboundAt) console.log(`最近发消息: ${health.lastOutboundAt}`)
    if (health.lastError) console.log(`最近错误: ${health.lastError}`)
  }
  console.log(`映射会话数: ${Object.keys(state.sessions ?? {}).length}`)
}

export function autostart() {
  const state = readState()
  if (!state.credential) {
    console.log("❌ 未登录，先运行: OpenCode-Lychee weixin login")
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
}

export function autostop() {
  const result = removeAutoStart("weixin", bridgeT)
  console.log(`${result.ok ? "✅" : "⚠️"} ${result.message}`)
}

export function logout() {
  const result = removeAutoStart("weixin", bridgeT)
  clearState()
  console.log("✅ 已清除微信登录、会话和连接状态")
  if (!result.ok) console.log(`⚠️ ${result.message}；运行中的桥检测到凭证变化后仍会自行退出`)
}
