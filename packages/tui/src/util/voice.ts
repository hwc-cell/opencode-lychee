import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createSignal, onCleanup } from "solid-js"

export type VoiceStatus = {
  state: string
  text?: string
  message?: string
  ts?: number
}

const statusPath = join(homedir(), ".local", "state", "opencode", "voice.json")
const voiceBin = join(homedir(), ".local", "bin", "lychee-dictate")

export function voiceToolInstalled() {
  return process.platform === "darwin" && existsSync(voiceBin)
}

export function toggleVoiceRecording(current?: VoiceStatus) {
  if (!voiceToolInstalled()) return
  if (current?.state === "recording") {
    spawn(voiceBin, ["--stop"], { stdio: "ignore" })
    return
  }
  const process = spawn(voiceBin, ["--record"], { detached: true, stdio: "ignore" })
  process.unref()
}

export function useVoiceDictation(onResult: (text: string) => void) {
  const [voice, setVoice] = createSignal<VoiceStatus>()
  if (!voiceToolInstalled()) return { voice }
  let lastDone = 0
  try {
    const existing = JSON.parse(readFileSync(statusPath, "utf8")) as VoiceStatus
    if (existing.state === "done" && existing.ts !== undefined) {
      lastDone = existing.ts
      writeFileSync(statusPath, JSON.stringify({ state: "idle", ts: existing.ts }))
    }
  } catch {
    // A missing or partially written state file is retried on the next poll.
  }
  const timer = setInterval(() => {
    try {
      const status = JSON.parse(readFileSync(statusPath, "utf8")) as VoiceStatus
      setVoice(status)
      if (status.state !== "done" || status.ts === undefined || status.ts === lastDone) return
      lastDone = status.ts
      if (status.text) onResult(status.text)
      writeFileSync(statusPath, JSON.stringify({ state: "idle", ts: status.ts }))
    } catch {
      // The helper writes atomically enough for polling; ignore transient reads.
    }
  }, 500)
  onCleanup(() => clearInterval(timer))
  return { voice }
}
