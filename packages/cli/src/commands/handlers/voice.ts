import { Effect } from "effect"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"

const bin = join(homedir(), ".local", "bin", "lychee-dictate")
const modelDir = join(homedir(), ".local", "share", "opencode", "whisper")
const modelConfig = join(homedir(), ".local", "state", "opencode", "voice-model.txt")
const modelUrls = {
  tiny: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
  base: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  small: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
} as const

type Model = keyof typeof modelUrls

function modelName(value: string): Model {
  return value === "tiny" || value === "small" ? value : "base"
}

function modelPath(value: string) {
  return join(modelDir, `ggml-${modelName(value)}.bin`)
}

function selectedModel() {
  try {
    return modelName(readFileSync(modelConfig, "utf8").trim())
  } catch {
    return "base"
  }
}

function whisperCliPath() {
  return [
    "/opt/homebrew/bin/whisper-cli",
    "/usr/local/bin/whisper-cli",
    join(homedir(), ".local", "bin", "whisper-cli"),
  ].find(existsSync)
}

function command(command: string, args: string[]) {
  return spawnSync(command, args, { stdio: "ignore" })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readVoiceStatus() {
  const file = join(homedir(), ".local", "state", "opencode", "voice.json")
  if (!existsSync(file)) return
  try {
    return JSON.parse(readFileSync(file, "utf8")) as { state: string; text?: string; message?: string }
  } catch {
    return
  }
}

async function authorize() {
  if (!existsSync(bin)) {
    console.log("❌ 未安装，先运行: OpenCode-Lychee voice install")
    return
  }
  command("codesign", ["--force", "--sign", "-", bin])
  console.log("· 已打开「辅助功能」设置页")
  console.log("⚠️ 如果列表里已有 lychee-dictate，请先删除旧条目，再重新添加并勾选")
  spawnSync("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"], {
    stdio: "ignore",
  })
  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(2000)
    if (spawnSync(bin, ["--check"], { stdio: "ignore" }).status === 0) {
      console.log("✅ 授权成功!")
      await start()
      return
    }
    if (attempt % 5 === 4) console.log(`…还在等待授权 (${(attempt + 1) * 2}s)`)
  }
  console.log("❌ 等待超时。请确认辅助功能开关已开启，再运行: OpenCode-Lychee voice authorize")
}

async function install(model: Model) {
  console.log("🍈 安装语音输入: lychee-dictate + whisper.cpp")
  if (process.platform !== "darwin") {
    console.log("❌ 仅支持 macOS（需要全局按键监听和 AVFoundation 录音）")
    return
  }
  let whisper = whisperCliPath()
  if (!whisper) {
    console.log("• 未找到 whisper-cli，尝试通过 Homebrew 安装…")
    command("/opt/homebrew/bin/brew", ["install", "whisper-cpp"])
    whisper = whisperCliPath()
  }
  console.log(whisper ? `✅ whisper-cli: ${whisper}` : "⚠️ 自动安装失败，请手动执行: brew install whisper-cpp")

  const target = modelPath(model)
  if (!existsSync(target)) {
    console.log(`• 下载模型 ${model}…`)
    command("mkdir", ["-p", modelDir])
    const args = ["-L", "--fail", "--connect-timeout", "20", modelUrls[model], "-o", target]
    let result = spawnSync("curl", args, { stdio: "ignore" })
    if (result.status !== 0) {
      console.log("• 官方源超时，尝试镜像…")
      result = spawnSync(
        "curl",
        args.map((arg) => arg.replace("https://huggingface.co/", "https://hf-mirror.com/")),
        {
          stdio: "ignore",
        },
      )
    }
    console.log(result.status === 0 && existsSync(target) ? `✅ 模型: ${target}` : "⚠️ 模型下载失败，可稍后重试")
  } else console.log(`✅ 模型: ${target}`)
  if (existsSync(target)) {
    command("mkdir", ["-p", join(homedir(), ".local", "state", "opencode")])
    writeFileSync(modelConfig, `${model}\n`)
  }

  const source = join(import.meta.dir, "..", "..", "..", "..", "tui", "lychee-dictate.swift")
  if (!existsSync(source)) {
    console.log("❌ 找不到 lychee-dictate.swift 源码（需在仓库内运行）")
    return
  }
  console.log("• 编译 lychee-dictate…")
  command("mkdir", ["-p", join(homedir(), ".local", "bin")])
  const built = spawnSync(
    "swiftc",
    ["-O", "-framework", "Cocoa", "-framework", "AVFoundation", "-framework", "ApplicationServices", source, "-o", bin],
    { stdio: "ignore" },
  )
  if (built.status !== 0 || !existsSync(bin)) {
    console.log("❌ 编译失败（需要 Xcode Command Line Tools: xcode-select --install）")
    return
  }
  command("codesign", ["--force", "--sign", "-", bin])
  console.log(`✅ lychee-dictate: ${bin}`)
  await start()
}

async function start() {
  if (!existsSync(bin)) {
    console.log("❌ 未安装，先运行: OpenCode-Lychee voice install")
    return
  }
  const process = spawn(bin, [], { detached: true, stdio: "ignore" })
  process.unref()
  await sleep(1500)
  const status = readVoiceStatus()
  if (status?.state === "error") {
    console.log(`⚠️ 启动失败: ${status.message ?? "未知原因"}`)
    console.log("· 请运行 OpenCode-Lychee voice authorize 授权辅助功能")
    return
  }
  console.log("✅ 已启动: 按住左 Command 说话，松开自动转写")
}

function stop() {
  spawnSync("pkill", ["-f", "lychee-dictate"], { stdio: "ignore" })
  console.log("✅ 已停止")
}

function status() {
  const value = readVoiceStatus()
  if (!value) {
    console.log("状态: 未运行（无状态文件）")
    return
  }
  console.log(
    `状态: ${value.state}${value.text ? ` — ${value.text}` : ""}${value.message ? ` — ${value.message}` : ""}`,
  )
}

function test() {
  const model = selectedModel()
  console.log("🍈 语音输入自检:")
  console.log(`· lychee-dictate: ${existsSync(bin) ? "✅" : "❌（先运行 voice install）"}`)
  console.log(`· whisper-cli: ${whisperCliPath() ? "✅" : "❌（brew install whisper-cpp）"}`)
  console.log(`· 模型(${model}): ${existsSync(modelPath(model)) ? "✅" : "❌（voice install 会下载）"}`)
}

async function run(action: "install" | "authorize" | "start" | "stop" | "status" | "test", model: Model) {
  if (action === "install") return install(model)
  if (action === "authorize") return authorize()
  if (action === "start") return start()
  if (action === "stop") return stop()
  if (action === "status") return status()
  return test()
}

export default Runtime.handler(Commands.commands.voice, (input) => Effect.promise(() => run(input.action, input.model)))
