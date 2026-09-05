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

type TFunc = (key: string) => string

export function installAutoStart(channel: string, dir: string, t: TFunc): { ok: boolean; message: string } {
  if (process.platform !== "darwin") {
    return { ok: false, message: t("cmdNotFound") }
  }
  const launcher = join(homedir(), ".local", "bin", "OpenCode-Lychee")
  if (!existsSync(launcher)) {
    return { ok: false, message: t("cmdMissingLauncher") }
  }
  const program = [launcher, channel, "run", "--dir", dir]
  const path = plistPath(channel)
  writeFileSync(path, plist(channel, program, homedir()))

  // 先卸载旧的再加载新的, 保证参数生效
  spawnSync("launchctl", ["unload", "-w", path], { stdio: "ignore" })
  const res = spawnSync("launchctl", ["load", "-w", path], { stdio: "ignore" })
  if (res.status !== 0) {
    return { ok: false, message: t("cmdLaunchFailed") }
  }
  return { ok: true, message: t("cmdOn") }
}

export function removeAutoStart(channel: string, t: TFunc): { ok: boolean; message: string } {
  if (process.platform !== "darwin") {
    return { ok: true, message: t("cmdNotDarwin") }
  }
  const path = plistPath(channel)
  if (!existsSync(path)) return { ok: true, message: t("cmdNotInstalled") }
  spawnSync("launchctl", ["unload", "-w", path], { stdio: "ignore" })
  rmSync(path, { force: true })
  return { ok: true, message: t("cmdOff") }
}
