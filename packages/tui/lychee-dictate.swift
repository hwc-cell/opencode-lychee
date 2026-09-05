// lychee-dictate — OpenCode-Lychee 语音输入助手 (macOS)
// 全局监听"左 Command 键": 按住开始录音(AVFoundation), 松开停止并用
// whisper.cpp (whisper-cli) 转写, 结果写入 ~/.local/state/opencode/voice.json,
// 由 TUI 轮询后自动填入输入框。
//
// 编译: swiftc -O -framework Cocoa -framework AVFoundation -framework ApplicationServices \
//          lychee-dictate.swift -o ~/.local/bin/lychee-dictate
// 授权: 首次运行需在 系统设置 > 隐私与安全 > 辅助功能 中允许

import Cocoa
import AVFoundation
import ApplicationServices

// MARK: - 路径

let home = FileManager.default.homeDirectoryForCurrentUser.path
let stateDir = "\(home)/.local/state/opencode"
let statePath = "\(stateDir)/voice.json"
let audioPath = "\(NSTemporaryDirectory())lychee-dictate.wav"
let modelPath = "\(home)/.local/share/opencode/whisper/ggml-base.bin"

// MARK: - 状态文件

func writeState(_ state: [String: Any]) {
  var dict = state
  dict["ts"] = Int(Date().timeIntervalSince1970 * 1000)
  guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return }
  try? FileManager.default.createDirectory(atPath: stateDir, withIntermediateDirectories: true)
  try? data.write(to: URL(fileURLWithPath: statePath))
}

// MARK: - 录音

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
      let r = try AVAudioRecorder(url: URL(fileURLWithPath: audioPath), settings: settings)
      r.delegate = self
      if r.record() {
        recorder = r
        print("▶️ recording → \(audioPath)")
      } else {
        writeState(["state": "error", "message": "录音启动失败(请检查麦克风权限)"])
      }
    } catch {
      writeState(["state": "error", "message": "录音启动失败: \(error.localizedDescription)"])
    }
  }

  func stopAndTranscribe() {
    guard let recorder else { return }
    recorder.stop()
    self.recorder = nil
    // 稍等文件落盘再转写
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
      transcribe()
    }
  }

  func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
    writeState(["state": "error", "message": "录音出错: \(error?.localizedDescription ?? "unknown")"])
  }
}

// MARK: - 转写 (whisper.cpp)

func findWhisper() -> String? {
  let candidates = [
    "\(home)/.local/bin/whisper-cli",
    "/opt/homebrew/bin/whisper-cli",
    "/usr/local/bin/whisper-cli",
    "/usr/bin/whisper-cli",
  ]
  for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
    return path
  }
  return nil
}

func transcribe() {
  guard FileManager.default.fileExists(atPath: audioPath), FileManager.default.fileExists(atPath: modelPath) else {
    writeState(["state": "error", "message": "模型未安装,请运行: lychee voice install"])
    return
  }
  guard let whisper = findWhisper() else {
    writeState(["state": "error", "message": "未找到 whisper-cli,请运行: lychee voice install"])
    return
  }
  print("🧠 transcribing…")
  let process = Process()
  process.executableURL = URL(fileURLWithPath: whisper)
  process.arguments = ["-m", modelPath, "-f", audioPath, "-l", "zh", "--no-prints", "-otxt", "-of", "\(audioPath).out"]
  process.standardError = FileHandle.nullDevice
  do {
    try process.run()
    process.waitUntilExit()
    let txtPath = "\(audioPath).out.txt"
    if let text = try? String(contentsOfFile: txtPath, encoding: .utf8) {
      let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmed.isEmpty {
        writeState(["state": "error", "message": "没听清,再说一次?"])
      } else {
        writeState(["state": "done", "text": trimmed])
        print("✅ \(trimmed)")
      }
    } else {
      writeState(["state": "error", "message": "转写失败(退出码 \(process.terminationStatus))"])
    }
  } catch {
    writeState(["state": "error", "message": "转写失败: \(error.localizedDescription)"])
  }
}

// MARK: - 全局按键监听 (左 Command)

let leftCmdKeyCode: CGKeyCode = 0x37 // kVK_LeftCommand
var isDown = false

func checkTrusted() -> Bool {
  let trusted = AXIsProcessTrusted()
  if !trusted {
    writeState(["state": "error", "message": "需要辅助功能权限: 系统设置 > 隐私与安全 > 辅助功能, 勾选 lychee-dictate"])
    print("⚠️ 请在 系统设置 > 隐私与安全 > 辅助功能 中允许 lychee-dictate")
    if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
      NSWorkspace.shared.open(url)
    }
  }
  return trusted
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
        let cmdDown = event.flags.contains(.maskCommand)
        // 只关心左 Command(0x37); 有的系统 flagsChanged 不报 keycode, 退而接受任意 Command
        let isLeft = keyCode == leftCmdKeyCode || keyCode == 0
        if isLeft && cmdDown && !isDown {
          isDown = true
          writeState(["state": "recording"])
          recorder.start()
        } else if isLeft && !cmdDown && isDown {
          isDown = false
          writeState(["state": "recording"]) // 保持, 转写完成覆盖为 done
          recorder.stopAndTranscribe()
        }
      }
      return Unmanaged.passUnretained(event)
    },
    userInfo: nil
  ) else {
    writeState(["state": "error", "message": "无法监听按键(权限不足或被占用)"])
    print("⚠️ 无法创建按键监听, 请检查辅助功能权限")
    exit(1)
  }
  let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
  CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
  CGEvent.tapEnable(tap: tap, enable: true)
  print("🎤 lychee-dictate 已启动: 按住左 Command 说话, 松开自动转写输入")
  CFRunLoopRun()
}

// MARK: - main

let recorder = Recorder()
// 探针模式: lychee voice authorize 用来轮询授权状态 (已授权退出码 0)
if CommandLine.arguments.contains("--check") {
  exit(AXIsProcessTrusted() ? 0 : 1)
}
if checkTrusted() {
  runEventTap()
}
