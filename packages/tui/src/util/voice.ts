import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createSignal, onCleanup } from "solid-js"

// lychee-dictate(全局监听左 Command 的语音输入工具)的状态文件。
// TUI 每 500ms 轮询: done -> 把转写文本回调给输入框插入, 并写回 idle 防重复。

export type VoiceStatus = {
  state: string
  text?: string
  message?: string
  ts?: number
}

export const VOICE_STATUS_PATH = join(homedir(), ".local", "state", "opencode", "voice.json")

export function voiceToolInstalled(): boolean {
  if (process.platform !== "darwin") return false
  return existsSync(join(homedir(), ".local", "bin", "lychee-dictate"))
}

export function useVoiceDictation(onResult: (text: string) => void) {
  const [voice, setVoice] = createSignal<VoiceStatus | undefined>(undefined)
  if (process.platform !== "darwin" || !voiceToolInstalled()) {
    return { voice }
  }
  let lastDoneTs = 0
  const timer = setInterval(() => {
    try {
      if (!existsSync(VOICE_STATUS_PATH)) return
      const status = JSON.parse(readFileSync(VOICE_STATUS_PATH, "utf8")) as VoiceStatus
      setVoice(status)
      if (status.state === "done" && status.ts !== undefined && status.ts !== lastDoneTs) {
        lastDoneTs = status.ts
        if (status.text) onResult(status.text)
        // 写回 idle: 即使写失败, ts 已记录也不会重复消费
        try {
          writeFileSync(VOICE_STATUS_PATH, JSON.stringify({ state: "idle", ts: status.ts }))
        } catch {
          // 忽略
        }
      }
    } catch {
      // 状态文件半写状态时忽略
    }
  }, 500)
  onCleanup(() => clearInterval(timer))
  return { voice }
}
