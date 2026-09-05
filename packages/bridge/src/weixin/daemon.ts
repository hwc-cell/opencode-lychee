import { existsSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

// macOS LaunchAgent 常驻: 开机自启 + 崩溃自动重启 (按通道安装, 如 weixin/slack/telegram)
function plistPath(channel: string): string {
  return join(homedir(), "Library", "LaunchAgents", `com.lychee.${channel}.plist`)
}

function logPath(channel: string): string {
  return join(homedir(), ".local", "state", "opencode", `${channel}.log`)
}

export function isAutoStartInstalled(channel: string): boolean {
  return existsSync(plistPath(channel))
}

function xmlEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function plist(channel: string, program: string[], home: string): string {
  const args = program.map((arg) => `    <string>${xmlEscape(arg)}</string>`).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.lychee.${channel}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OPENCODE_LANG</key>
    <string>zh</string>
    <key>HOME</key>
    <string>${xmlEscape(home)}</string>
    <key>PATH</key>
    <string>${xmlEscape(home)}/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(logPath(channel))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(logPath(channel))}</string>
</dict>
</plist>
`
}

export function installAutoStart(channel: string, dir: string): { ok: boolean; message: string } {
  if (process.platform !== "darwin") {
    return { ok: false, message: "后台常驻目前仅支持 macOS(其他系统请自行配置 systemd)" }
  }
  const launcher = join(homedir(), ".local", "bin", "OpenCode-Lychee")
  if (!existsSync(launcher)) {
    return {
      ok: false,
      message:
        "未找到启动器, 请先执行: cp packages/opencode/lychee.sh ~/.local/bin/OpenCode-Lychee && chmod +x ~/.local/bin/OpenCode-Lychee",
    }
  }
  const program = [launcher, channel, "run", "--dir", dir]
  const path = plistPath(channel)
  writeFileSync(path, plist(channel, program, homedir()))

  // 先卸载旧的再加载新的, 保证参数生效
  spawnSync("launchctl", ["unload", "-w", path], { stdio: "ignore" })
  const res = spawnSync("launchctl", ["load", "-w", path], { stdio: "ignore" })
  if (res.status !== 0) {
    return { ok: false, message: "launchctl 加载失败, 请手动检查 plist 文件" }
  }
  return { ok: true, message: "已开启后台常驻(开机自启 + 崩溃自动重启)" }
}

export function removeAutoStart(channel: string): { ok: boolean; message: string } {
  if (process.platform !== "darwin") {
    return { ok: true, message: "非 macOS, 无 launchd 配置可移除" }
  }
  const path = plistPath(channel)
  if (!existsSync(path)) return { ok: true, message: "未开启过后台常驻" }
  spawnSync("launchctl", ["unload", "-w", path], { stdio: "ignore" })
  rmSync(path, { force: true })
  return { ok: true, message: "已关闭后台常驻" }
}
