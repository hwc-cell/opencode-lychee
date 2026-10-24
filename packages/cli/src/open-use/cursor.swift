import AppKit

struct CursorCommand: Decodable {
    let id: Int
    let action: String
    let displayID: String?
    let x: Double?
    let y: Double?
    let seconds: Double?
}

struct DisplayInfo: Encodable {
    let id: String
    let name: String
    let width: Double
    let height: Double
    let scale: Double
}

struct CursorState: Encodable {
    let visible: Bool
    let displayID: String?
    let x: Double?
    let y: Double?
    let realInput: Bool = false
}

struct CursorReply: Encodable {
    let id: Int
    let ok: Bool
    var error: String?
    var state: CursorState?
    var displays: [DisplayInfo]?
}

@MainActor
final class CursorView: NSView {
    override var isFlipped: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(0.24)
        shadow.shadowBlurRadius = 5
        shadow.shadowOffset = NSSize(width: 0, height: -2)
        NSGraphicsContext.saveGraphicsState()
        shadow.set()
        let arrow = NSBezierPath()
        arrow.move(to: NSPoint(x: 12, y: 10))
        arrow.line(to: NSPoint(x: 12, y: 39))
        arrow.line(to: NSPoint(x: 19, y: 32))
        arrow.line(to: NSPoint(x: 25, y: 45))
        arrow.line(to: NSPoint(x: 31, y: 42))
        arrow.line(to: NSPoint(x: 25, y: 29))
        arrow.line(to: NSPoint(x: 36, y: 29))
        arrow.close()
        NSColor.white.setStroke()
        arrow.lineWidth = 4
        arrow.lineJoinStyle = .round
        arrow.stroke()
        NSColor(srgbRed: 232 / 255, green: 76 / 255, blue: 70 / 255, alpha: 1).setFill()
        arrow.fill()
        let badge = NSBezierPath(roundedRect: NSRect(x: 40, y: 30, width: 98, height: 25), xRadius: 12, yRadius: 12)
        NSColor(srgbRed: 32 / 255, green: 52 / 255, blue: 63 / 255, alpha: 0.96).setFill()
        badge.fill()
        NSGraphicsContext.restoreGraphicsState()
        let name = NSAttributedString(string: "Open Use", attributes: [
            .font: NSFont.systemFont(ofSize: 12, weight: .semibold),
            .foregroundColor: NSColor.white,
        ])
        name.draw(at: NSPoint(x: 57, y: 34))
        NSColor(srgbRed: 126 / 255, green: 176 / 255, blue: 60 / 255, alpha: 1).setFill()
        NSBezierPath(ovalIn: NSRect(x: 48, y: 40, width: 5, height: 5)).fill()
    }
}

@MainActor
final class CursorController {
    private let panel: NSPanel
    private var buffer = Data()
    private var expiration: Task<Void, Never>?
    private var state = CursorState(visible: false, displayID: nil, x: nil, y: nil)

    init() {
        panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 154, height: 68),
            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false
        )
        panel.title = "Open Use — 模型光标（仅指示）"
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.isFloatingPanel = true
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        panel.contentView = CursorView(frame: NSRect(x: 0, y: 0, width: 154, height: 68))
    }

    private func screenID(_ screen: NSScreen) -> String {
        (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.stringValue ?? ""
    }

    private func displays() -> [DisplayInfo] {
        NSScreen.screens.map {
            DisplayInfo(id: screenID($0), name: $0.localizedName, width: $0.frame.width,
                        height: $0.frame.height, scale: $0.backingScaleFactor)
        }
    }

    private func hide() {
        expiration?.cancel()
        expiration = nil
        panel.orderOut(nil)
        state = CursorState(visible: false, displayID: state.displayID, x: state.x, y: state.y)
    }

    private func currentState() -> CursorState {
        CursorState(visible: panel.isVisible, displayID: state.displayID, x: state.x, y: state.y)
    }

    private func execute(_ command: CursorCommand) -> CursorReply {
        switch command.action {
        case "displays":
            return CursorReply(id: command.id, ok: true, state: currentState(), displays: displays())
        case "state":
            return CursorReply(id: command.id, ok: true, state: currentState())
        case "hide":
            hide()
            return CursorReply(id: command.id, ok: true, state: currentState())
        case "move":
            guard let screen = NSScreen.screens.first(where: { screenID($0) == command.displayID }),
                  let x = command.x, let y = command.y, x.isFinite, y.isFinite,
                  x >= 0, y >= 0, x < screen.frame.width, y < screen.frame.height,
                  let seconds = command.seconds, seconds.isFinite, (1...30).contains(seconds) else {
                return CursorReply(id: command.id, ok: false,
                                   error: "Invalid display or coordinates. Use display-local logical points and seconds in 1...30.")
            }
            expiration?.cancel()
            // Tool coordinates start at the selected display's top-left, in points, not Retina pixels.
            panel.setFrameOrigin(NSPoint(x: screen.frame.minX + x - 12,
                                         y: screen.frame.maxY - y - (panel.frame.height - 10)))
            panel.orderFrontRegardless()
            state = CursorState(visible: true, displayID: screenID(screen), x: x, y: y)
            expiration = Task {
                do { try await Task.sleep(for: .seconds(seconds)) } catch { return }
                hide()
            }
            return CursorReply(id: command.id, ok: true, state: currentState())
        default:
            return CursorReply(id: command.id, ok: false, error: "Unsupported cursor action. No real input is available.")
        }
    }

    func receive(_ data: Data) {
        if data.isEmpty {
            hide()
            NSApplication.shared.terminate(nil)
            return
        }
        buffer.append(data)
        while let end = buffer.firstIndex(of: 10) {
            let line = Data(buffer[..<end])
            buffer.removeSubrange(...end)
            do {
                let reply = execute(try JSONDecoder().decode(CursorCommand.self, from: line))
                var encoded = try JSONEncoder().encode(reply)
                encoded.append(10)
                FileHandle.standardOutput.write(encoded)
            } catch {
                FileHandle.standardError.write(Data("Open Use: invalid native request\n".utf8))
            }
        }
    }
}

@MainActor
func main() {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--preview" {
        let view = CursorView(frame: NSRect(x: 0, y: 0, width: 154, height: 68))
        guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { exit(1) }
        view.cacheDisplay(in: view.bounds, to: bitmap)
        guard let png = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
        do { try png.write(to: URL(fileURLWithPath: CommandLine.arguments[2])) }
        catch { FileHandle.standardError.write(Data("Open Use: cannot write preview\n".utf8)); exit(1) }
        return
    }
    let controller = CursorController()
    // File descriptor callbacks bridge into the single AppKit actor; no UI state leaves it.
    FileHandle.standardInput.readabilityHandler = { handle in
        let data = handle.availableData
        Task { @MainActor in controller.receive(data) }
    }
    app.run()
}

main()
