import { existsSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

// macOS LaunchAgent 常驻: 开机自启 + 崩溃自动重启
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", "com.lychee.weixin.plist")
const LOG_PATH = join(homedir(), ".local", "state", "opencode", "weixin.log")

export function isAutoStartInstalled(): boolean {
  return existsSync(PLIST_PATH)
}

function xmlEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function plist(program: string[], home: string): string {
  const args = program.map((arg) => `    <string>${xmlEscape(arg)}</string>`).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.lychee.weixin</string>
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
    <string>/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(LOG_PATH)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(LOG_PATH)}</string>
</dict>
</plist>
`
}

export function installAutoStart(dir: string): { ok: boolean; message: string } {
  if (process.platform !== "darwin") {
    return { ok: false, message: "后台常驻目前仅支持 macOS(其他系统请自行配置 systemd)" }
  }
  const launcher = join(homedir(), ".local", "bin", "OpenCode-Lychee")
  if (!existsSync(launcher)) {
    return {
      ok: false,
      message: "未找到启动器, 请先执行: cp packages/opencode/lychee.sh ~/.local/bin/OpenCode-Lychee && chmod +x ~/.local/bin/OpenCode-Lychee",
    }
  }
  const program = [launcher, "weixin", "run", "--dir", dir]
  writeFileSync(PLIST_PATH, plist(program, homedir()))

  // 先卸载旧的再加载新的, 保证参数生效
  spawnSync("launchctl", ["unload", "-w", PLIST_PATH], { stdio: "ignore" })
  const res = spawnSync("launchctl", ["load", "-w", PLIST_PATH], { stdio: "ignore" })
  if (res.status !== 0) {
    return { ok: false, message: "launchctl 加载失败, 请手动检查 ~/Library/LaunchAgents/com.lychee.weixin.plist" }
  }
  return { ok: true, message: "已开启后台常驻(开机自启 + 崩溃自动重启)" }
}

export function removeAutoStart(): { ok: boolean; message: string } {
  if (process.platform !== "darwin") {
    return { ok: true, message: "非 macOS, 无 launchd 配置可移除" }
  }
  if (!existsSync(PLIST_PATH)) return { ok: true, message: "未开启过后台常驻" }
  spawnSync("launchctl", ["unload", "-w", PLIST_PATH], { stdio: "ignore" })
  rmSync(PLIST_PATH, { force: true })
  return { ok: true, message: "已关闭后台常驻" }
}
