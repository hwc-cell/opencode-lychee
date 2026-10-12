import { autoStartStatus, readState } from "@opencode/bridge"
import { OpenCode } from "@opencode/client"
import { Service, type Endpoint } from "@opencode/client/effect/service"
import { Effect, Option, Redacted } from "effect"
import { stat } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { ServiceConfig } from "../../../services/service-config"
import { Env } from "../../../env"

export default Runtime.handler(
  Commands.commands.weixin.commands.doctor,
  Effect.fn("cli.weixin.doctor")(function* (input) {
    const state = readState()
    const directory = state.workDir ?? process.cwd()
    const info = yield* Effect.promise(() => stat(directory).catch(() => undefined))
    const launcher = yield* Effect.promise(() =>
      stat(path.join(homedir(), ".local", "bin", "OpenCode-Lychee")).catch(() => undefined),
    )
    const daemon = autoStartStatus("weixin")
    console.log("🍈 微信连接自检（不会启动服务或发送消息）")
    console.log(state.credential ? "✅ 本地登录凭据已保存（有效性以运行状态为准）" : "❌ 尚未登录 → weixin login")
    console.log(info?.isDirectory() ? "✅ 工作目录可访问" : "❌ 工作目录不存在或无法访问 → weixin run --dir <目录>")
    console.log(launcher?.isFile() ? "✅ 快捷启动器存在" : "⚠️ 尚未安装快捷启动器，后台常驻需要它")
    console.log(daemon.running ? "✅ 后台桥运行中" : "⚠️ 后台桥未运行 → weixin run 或 weixin autostart")
    const health = state.health
    const recent = health && Date.now() - Date.parse(health.updatedAt) < 120_000
    const alive = health?.pid
      ? (() => {
          try {
            process.kill(health.pid, 0)
            return true
          } catch {
            return false
          }
        })()
      : false
    console.log(
      health?.status === "online" && recent && alive
        ? "✅ 最近微信轮询正常"
        : health?.status === "expired"
          ? "❌ 微信登录已失效 → weixin login"
          : "⚠️ 没有新鲜的在线状态 → weixin status",
    )
    console.log(state.model ? "✅ 默认模型已配置" : "⚠️ 未配置默认模型 → weixin configure")
    console.log(`待处理入站消息：${Object.keys(state.inbox ?? {}).length}`)

    const provided = Option.getOrUndefined(input.server)
    const password = provided ? yield* Env.password : undefined
    const options = yield* ServiceConfig.options()
    const endpoint: Endpoint | undefined = provided
      ? {
          url: provided,
          auth: password ? { type: "basic", username: "opencode", password: Redacted.value(password) } : undefined,
        }
      : yield* Service.discover({ ...options, version: undefined })
    if (!endpoint) {
      console.log("⚠️ 未发现 OpenCode 后台服务 → service start，或 doctor --server <地址>")
      return
    }
    const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
    const result = yield* Effect.promise(async () => {
      try {
        await client.server.info({ signal: AbortSignal.timeout(5000) })
        const response = await client.model.list({ location: { directory } }, { signal: AbortSignal.timeout(5000) })
        return response.data
      } catch {
        return undefined
      }
    })
    if (!result) {
      console.log("❌ AI 服务无法连接或认证失败 → 检查 service status 与 OPENCODE_PASSWORD")
      return
    }
    console.log("✅ AI 服务可以连接并通过认证")
    const selected = state.model
    if (
      selected &&
      !result.some((model) => model.enabled && model.providerID === selected.providerID && model.id === selected.id)
    )
      console.log("❌ 已配置模型当前不可用 → auth login 或 weixin configure")
    else console.log(`✅ 服务返回 ${result.filter((model) => model.enabled).length} 个可用模型`)
  }),
)
