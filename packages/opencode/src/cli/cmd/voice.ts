import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawn, spawnSync } from "node:child_process"
import type { Argv, CommandModule } from "yargs"
import { UI } from "../ui"

// 语音输入: lychee-dictate(全局监听左 Command) + whisper.cpp 本地转写
// 状态文件 ~/.local/state/opencode/voice.json, TUI 轮询后自动填入输入框。

const BIN = join(homedir(), ".local", "bin", "lychee-dictate")
const WHISPER_MODEL = "ggml-base.bin"
const MODEL_DIR = join(homedir(), ".local", "share", "opencode", "whisper")
const MODEL_PATH = join(MODEL_DIR, WHISPER_MODEL)

const MODEL_URLS: Record<string, string> = {
  tiny: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
  base: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  small: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
}

// huggingface 连不上时走镜像(hf-mirror.com)
function mirrorUrl(url: string): string {
  return url.replace("https://huggingface.co/", "https://hf-mirror.com/")
}

function binDir(): string {
  return join(homedir(), ".local", "bin")
}

function whisperCliPath(): string | undefined {
  return ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli", join(homedir(), ".local", "bin", "whisper-cli")].find(
    (p) => existsSync(p),
  )
}

export const VoiceCommand: CommandModule = {
  command: "voice <action>",
  describe: "语音输入(按住左 Command 说话, 松开自动转写填入输入框)",
  builder: (y: Argv) =>
    y
      .positional("action", { choices: ["install", "start", "stop", "status", "test"], demandOption: true, describe: "操作" })
      .option("model", { choices: ["tiny", "base", "small"], default: "base", describe: "whisper 模型大小(自动下载)" }),
  handler: async (args) => {
    const action = (args as unknown as { action: string }).action
    if (action === "install") return handleInstall((args as unknown as { model: string }).model)
    if (action === "start") return handleStart()
    if (action === "stop") return handleStop()
    if (action === "status") return handleStatus()
    if (action === "test") return handleTest()
  },
}

function cmd(cmdline: string, args: string[]) {
  return spawnSync(cmdline, args, { stdio: "ignore" })
}

async function handleInstall(model: string) {
  UI.println("🍈 安装语音输入: lychee-dictate + whisper.cpp")
  if (process.platform !== "darwin") {
    UI.println("❌ 仅支持 macOS(需要全局按键监听 + AVFoundation 录音)")
    return
  }
  // 1. whisper.cpp
  let whisper = whisperCliPath()
  if (!whisper) {
    UI.println("• 未找到 whisper-cli, 尝试 brew 安装…")
    cmd("/opt/homebrew/bin/brew", ["install", "whisper-cpp"])
    whisper = whisperCliPath()
  }
  if (!whisper) {
    UI.println("⚠️ 自动安装失败, 请手动执行: brew install whisper-cpp")
  } else {
    UI.println(`✅ whisper-cli: ${whisper}`)
  }
  // 2. 转写模型
  if (!existsSync(MODEL_PATH)) {
    const url = MODEL_URLS[model] ?? MODEL_URLS.base
    UI.println(`• 下载模型 ${WHISPER_MODEL.replace("ggml-", "")}…`)
    cmd("mkdir", ["-p", MODEL_DIR])
    let res = spawnSync("curl", ["-L", "--fail", "--connect-timeout", "20", url, "-o", MODEL_PATH], { stdio: "ignore" })
    if (res.status !== 0) {
      UI.println("• 官方源超时, 尝试镜像…")
      res = spawnSync("curl", ["-L", "--fail", "--connect-timeout", "20", mirrorUrl(url), "-o", MODEL_PATH], { stdio: "ignore" })
    }
    if (res.status === 0 && existsSync(MODEL_PATH)) {
      UI.println(`✅ 模型: ${MODEL_PATH}`)
    } else {
      UI.println("⚠️ 模型下载失败(可稍后手动下载, 放至上述路径): lychee voice install")
    }
  } else {
    UI.println(`✅ 模型: ${MODEL_PATH}`)
  }
  // 3. 编译 lychee-dictate
  const source = join(process.cwd(), "src", "..", "..", "tui", "lychee-dictate.swift")
  const found = [source, join(homedir(), ".local", "bin", "lychee-dictate.swift"), "/tmp/lychee-dictate.swift"].find((p) => existsSync(p))
  if (!found) {
    UI.println("❌ 找不到 lychee-dictate.swift 源码(需在仓库内运行)")
    return
  }
  UI.println("• 编译 lychee-dictate…")
  cmd("mkdir", ["-p", binDir()])
  const build = spawnSync("swiftc", ["-O", "-framework", "Cocoa", "-framework", "AVFoundation", "-framework", "ApplicationServices", found, "-o", BIN], {
    stdio: "ignore",
  })
  if (build.status !== 0 || !existsSync(BIN)) {
    UI.println("❌ 编译失败(需要 Xcode Command Line Tools: xcode-select --install)")
    return
  }
  UI.println(`✅ lychee-dictate: ${BIN}`)
  UI.println("")
  UI.println("📌 使用:")
  UI.println("· 启动: lychee voice start(常驻后台)")
  UI.println("· 首次需授权: 系统设置 > 隐私与安全 > 辅助功能, 勾选 lychee-dictate")
  UI.println("· 在 TUI 输入框按住左 Command 说话, 松开自动转写填入")
}

async function handleStart() {
  if (!existsSync(BIN)) {
    UI.println("❌ 未安装, 先运行: lychee voice install")
    return
  }
  UI.println("• 启动 lychee-dictate…")
  const proc = spawn(BIN, [], { detached: true, stdio: "ignore" })
  proc.unref()
  UI.println("✅ 已启动(按左 Command 说话即可; 首次需授权辅助功能)")
}

function handleStop() {
  spawnSync("pkill", ["-f", "lychee-dictate"], { stdio: "ignore" })
  UI.println("✅ 已停止")
}

function handleStatus() {
  const statusPath = join(homedir(), ".local", "state", "opencode", "voice.json")
  if (!existsSync(statusPath)) {
    UI.println("状态: 未运行(无状态文件)")
    return
  }
  try {
    const status = JSON.parse(readFileSync(statusPath, "utf8")) as { state: string; text?: string; message?: string }
    UI.println(`状态: ${status.state}${status.text ? ` — ${status.text}` : ""}${status.message ? ` — ${status.message}` : ""}`)
  } catch {
    UI.println("状态: 文件损坏")
  }
}

function handleTest() {
  // 不弹权限窗口的轻量自检: 工具存在性 + 模型 + whisper
  UI.println("🍈 语音输入自检:")
  UI.println(`· lychee-dictate: ${existsSync(BIN) ? "✅" : "❌(先 lychee voice install)"}`)
  UI.println(`· whisper-cli: ${whisperCliPath() ? "✅" : "❌(brew install whisper-cpp)"}`)
  UI.println(`· 模型: ${existsSync(MODEL_PATH) ? "✅" : "❌(lychee voice install 会下载)"}`)
}
