// lychee-dictate — OpenCode-Lychee 语音输入助手 (macOS)
// 按住左 Command 录音，松开后使用 whisper.cpp 转写。

import Cocoa
import AVFoundation
import ApplicationServices

let home = FileManager.default.homeDirectoryForCurrentUser.path
let stateDir = "\(home)/.local/state/opencode"
let statePath = "\(stateDir)/voice.json"
let audioPath = "\(NSTemporaryDirectory())lychee-dictate.wav"
let modelConfigPath = "\(stateDir)/voice-model.txt"
let configuredModel = (try? String(contentsOfFile: modelConfigPath, encoding: .utf8))?
  .trimmingCharacters(in: .whitespacesAndNewlines) ?? "base"
let modelName = ["tiny", "base", "small"].contains(configuredModel) ? configuredModel : "base"
let modelPath = "\(home)/.local/share/opencode/whisper/ggml-\(modelName).bin"

func writeState(_ state: [String: Any]) {
  var value = state
  value["ts"] = Int(Date().timeIntervalSince1970 * 1000)
  guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
  try? FileManager.default.createDirectory(atPath: stateDir, withIntermediateDirectories: true)
  try? data.write(to: URL(fileURLWithPath: statePath))
}

final class Recorder: NSObject, AVAudioRecorderDelegate {
  private var recorder: AVAudioRecorder?

  func start() {
    try? FileManager.default.removeItem(atPath: audioPath)
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: 16000.0,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
    ]
    do {
      let next = try AVAudioRecorder(url: URL(fileURLWithPath: audioPath), settings: settings)
      next.delegate = self
      if next.record() {
        recorder = next
        print("▶️ recording → \(audioPath)")
      } else {
        writeState(["state": "error", "message": "录音启动失败(请检查麦克风权限)"])
      }
    } catch {
      writeState(["state": "error", "message": "录音启动失败: \(error.localizedDescription)"])
    }
  }

  func stopRaw() {
    recorder?.stop()
    recorder = nil
  }

  func stopAndTranscribe() {
    stopRaw()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
      transcribe()
    }
  }

  func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
    writeState(["state": "error", "message": "录音出错: \(error?.localizedDescription ?? "unknown")"])
  }
}

func findWhisper() -> String? {
  let candidates = [
    "\(home)/.local/bin/whisper-cli",
    "/opt/homebrew/bin/whisper-cli",
    "/usr/local/bin/whisper-cli",
    "/usr/bin/whisper-cli",
  ]
  return candidates.first(where: FileManager.default.isExecutableFile)
}

func transcribe() {
  guard FileManager.default.fileExists(atPath: audioPath), FileManager.default.fileExists(atPath: modelPath) else {
    writeState(["state": "error", "message": "模型未安装,请运行: OpenCode-Lychee voice install"])
    return
  }
  guard let whisper = findWhisper() else {
    writeState(["state": "error", "message": "未找到 whisper-cli,请运行: OpenCode-Lychee voice install"])
    return
  }
  let process = Process()
  process.executableURL = URL(fileURLWithPath: whisper)
  process.arguments = ["-m", modelPath, "-f", audioPath, "-l", "zh", "--no-prints", "-otxt", "-of", "\(audioPath).out"]
  process.standardError = FileHandle.nullDevice
  do {
    try process.run()
    process.waitUntilExit()
    let output = "\(audioPath).out.txt"
    if let text = try? String(contentsOfFile: output, encoding: .utf8) {
      let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
      writeState(
        value.isEmpty
          ? ["state": "error", "message": "没听清,再说一次?"]
          : ["state": "done", "text": value]
      )
      return
    }
    writeState(["state": "error", "message": "转写失败(退出码 \(process.terminationStatus))"])
  } catch {
    writeState(["state": "error", "message": "转写失败: \(error.localizedDescription)"])
  }
}

let leftCommand: CGKeyCode = 0x37
var isDown = false

func checkTrusted() -> Bool {
  let trusted = AXIsProcessTrusted()
  if trusted { return true }
  writeState(["state": "error", "message": "需要辅助功能权限: 系统设置 > 隐私与安全 > 辅助功能, 勾选 lychee-dictate"])
  if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
    NSWorkspace.shared.open(url)
  }
  return false
}

func runEventTap() {
  let mask = CGEventMask(1 << CGEventType.flagsChanged.rawValue)
  guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: mask,
    callback: { _, type, event, _ in
      if type == .flagsChanged {
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let commandDown = event.flags.contains(.maskCommand)
        let isLeft = keyCode == leftCommand || keyCode == 0
        if isLeft && commandDown && !isDown {
          isDown = true
          writeState(["state": "recording"])
          recorder.start()
        } else if isLeft && !commandDown && isDown {
          isDown = false
          writeState(["state": "recording"])
          recorder.stopAndTranscribe()
        }
      }
      return Unmanaged.passUnretained(event)
    },
    userInfo: nil
  ) else {
    writeState(["state": "error", "message": "无法监听按键(权限不足或被占用)"])
    exit(1)
  }
  let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
  CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
  CGEvent.tapEnable(tap: tap, enable: true)
  print("🎤 lychee-dictate 已启动: 按住左 Command 说话, 松开自动转写输入")
  CFRunLoopRun()
}

let controlPath = "\(stateDir)/voice.ctl"

func runRecordMode() {
  try? FileManager.default.removeItem(atPath: controlPath)
  writeState(["state": "recording"])
  recorder.start()
  while !FileManager.default.fileExists(atPath: controlPath) {
    usleep(200_000)
  }
  try? FileManager.default.removeItem(atPath: controlPath)
  recorder.stopRaw()
  usleep(400_000)
  transcribe()
}

func runStopMode() {
  try? "stop".write(toFile: controlPath, atomically: true, encoding: .utf8)
}

let recorder = Recorder()
if CommandLine.arguments.contains("--check") {
  exit(AXIsProcessTrusted() ? 0 : 1)
}
if CommandLine.arguments.contains("--record") {
  runRecordMode()
  exit(0)
}
if CommandLine.arguments.contains("--stop") {
  runStopMode()
  exit(0)
}
if checkTrusted() {
  runEventTap()
}
