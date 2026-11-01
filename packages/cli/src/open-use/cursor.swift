import AppKit
import CoreGraphics
import ApplicationServices

struct CursorCommand: Decodable {
    let id: Int
    let action: String
    let displayID: String?
    let x: Double?
    let y: Double?
    let seconds: Double?
    let windowID: UInt32?
    let observationID: String?
    let elementID: Int?
    let text: String?
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
    var window: WindowInfo?
    var coordinateSpace: String = "display"
}

struct WindowBounds: Encodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct WindowInfo: Encodable {
    let id: UInt32
    let pid: Int32
    let app: String
    let bundleID: String?
    let title: String?
    let bounds: WindowBounds
}

struct CursorReply: Encodable {
    let id: Int
    let ok: Bool
    var error: String?
    var state: CursorState?
    var displays: [DisplayInfo]?
    var windows: [WindowInfo]?
    var observation: WindowObservation?
    var permissions: InputPermissions?
    var realInput: Bool?
    var action: String?
    var verified: Bool?
}

struct InputPermissions: Encodable {
    let inputEnabled: Bool
    let accessibility: Bool
    let executable: String
}

struct ObservedControl: Encodable {
    let id: Int
    let parent: Int?
    let role: String
    let label: String
    let text: String?
    let actions: [String]
    let enabled: Bool?
    let editable: Bool
    let bounds: WindowBounds?
}

struct WindowObservation: Encodable {
    let id: String
    let windowID: UInt32
    let elements: [ObservedControl]
    let truncated: Bool
}

struct OpenUseError: LocalizedError {
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

@MainActor
final class CursorView: NSView {
    static let canvas = NSSize(width: 32, height: 32)
    // The approved PNG's visible crop is 814 pixels wide; its rounded northwest tip is (29, 21) within it.
    static let hotspot = NSPoint(x: 29 * 32.0 / 814, y: 21 * 32.0 / 814)
    private let image: NSImage
    var drawingOrigin = NSPoint.zero
    override var isFlipped: Bool { true }

    init(image: NSImage) {
        self.image = image
        super.init(frame: NSRect(origin: .zero, size: Self.canvas))
    }

    required init?(coder: NSCoder) { nil }

    override func draw(_ dirtyRect: NSRect) {
        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }
        let translation = NSAffineTransform()
        translation.translateX(by: drawingOrigin.x, yBy: drawingOrigin.y)
        translation.concat()
        // Ignore the transparent margin while preserving the approved image's proportions and alpha.
        image.draw(in: NSRect(x: 0, y: 0, width: 32, height: 790 * 32.0 / 814),
                   from: NSRect(x: 225, y: 213, width: 814, height: 790),
                   operation: .sourceOver, fraction: 1, respectFlipped: true,
                   hints: [.interpolation: NSImageInterpolation.high])
    }
}

@MainActor
final class CursorController: NSObject {
    private let panel: NSPanel
    private let pointer: CursorView
    private var buffer = Data()
    private var expiration: Task<Void, Never>?
    private var tracking: Task<Void, Never>?
    private var selected: WindowInfo?
    private let allowInput: Bool
    private var observationID: String?
    private var observedWindow: AXUIElement?
    private var controls: [Int: AXUIElement] = [:]
    private var confirming = false
    private var readApproved: UInt32?
    private var desktopOwner: pid_t?
    private var state = CursorState(visible: false, displayID: nil, x: nil, y: nil)

    init(allowInput: Bool, image: NSImage) {
        self.allowInput = allowInput
        pointer = CursorView(image: image)
        panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: CursorView.canvas),
            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false
        )
        super.init()
        panel.title = "Open Use — 模型光标（仅指示）"
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.isFloatingPanel = false
        panel.level = .normal
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        panel.contentView = pointer
        NSWorkspace.shared.notificationCenter.addObserver(
            self, selector: #selector(frontmostChanged(_:)),
            name: NSWorkspace.didActivateApplicationNotification, object: nil
        )
    }

    @objc private func frontmostChanged(_ notification: Notification) {
        let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
        if app?.processIdentifier != (selected?.pid ?? desktopOwner) { panel.orderOut(nil) }
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
        tracking?.cancel()
        tracking = nil
        desktopOwner = nil
        panel.orderOut(nil)
        state = CursorState(visible: false, displayID: state.displayID, x: state.x, y: state.y)
    }

    private func currentState() -> CursorState {
        if let bound = selected {
            if let fresh = windows(bound.id).first, fresh.pid == bound.pid { selected = fresh }
            else { releaseWindow() }
        }
        if NSWorkspace.shared.frontmostApplication?.processIdentifier != (selected?.pid ?? desktopOwner) {
            panel.orderOut(nil)
        }
        var result = CursorState(visible: panel.isVisible, displayID: state.displayID, x: state.x, y: state.y, window: selected)
        result.coordinateSpace = selected == nil ? "display" : "window"
        return result
    }

    private func releaseWindow() {
        hide()
        selected = nil
        state = CursorState(visible: false, displayID: nil, x: nil, y: nil)
        invalidateObservation()
        readApproved = nil
    }

    private func windows(_ id: UInt32? = nil) -> [WindowInfo] {
        let options: CGWindowListOption = id == nil ? [.optionOnScreenOnly, .excludeDesktopElements] : .optionIncludingWindow
        guard let rows = CGWindowListCopyWindowInfo(options, id ?? kCGNullWindowID) as? [[String: Any]] else { return [] }
        return rows.compactMap { row in
            guard let number = row[kCGWindowNumber as String] as? UInt32,
                  let pid = row[kCGWindowOwnerPID as String] as? Int32,
                  pid != ProcessInfo.processInfo.processIdentifier,
                  (row[kCGWindowLayer as String] as? Int) == 0,
                  (row[kCGWindowIsOnscreen as String] as? Bool) == true,
                  let frame = row[kCGWindowBounds as String] as? [String: Double],
                  let x = frame["X"], let y = frame["Y"], let width = frame["Width"], let height = frame["Height"],
                  width > 0, height > 0 else { return nil }
            let app = NSRunningApplication(processIdentifier: pid)
            return WindowInfo(id: number, pid: pid, app: app?.localizedName ?? (row[kCGWindowOwnerName as String] as? String ?? ""),
                              bundleID: app?.bundleIdentifier, title: row[kCGWindowName as String] as? String,
                              bounds: WindowBounds(x: x, y: y, width: width, height: height))
        }
    }

    private func placeWindowPointer(x: Double, y: Double) -> Bool {
        let visible = windows()
        guard let bound = selected, let fresh = visible.first(where: { $0.id == bound.id }), fresh.pid == bound.pid,
              x.isFinite, y.isFinite, x >= 0, y >= 0, x < fresh.bounds.width, y < fresh.bounds.height,
              let primary = NSScreen.screens.first else { return false }
        // CGWindow bounds use Quartz global top-left points; AppKit uses bottom-left points.
        let point = NSPoint(x: fresh.bounds.x + x, y: primary.frame.maxY - fresh.bounds.y - y)
        guard let screen = NSScreen.screens.first(where: {
            point.x >= $0.frame.minX && point.x < $0.frame.maxX && point.y > $0.frame.minY && point.y <= $0.frame.maxY
        }) else { return false }
        selected = fresh
        let frame = NSRect(x: point.x - CursorView.hotspot.x,
                           y: point.y - (CursorView.canvas.height - CursorView.hotspot.y),
                           width: CursorView.canvas.width, height: CursorView.canvas.height)
        let windowFrame = NSRect(x: fresh.bounds.x, y: primary.frame.maxY - fresh.bounds.y - fresh.bounds.height,
                                 width: fresh.bounds.width, height: fresh.bounds.height)
        let clipped = frame.intersection(windowFrame).intersection(screen.frame)
        let covered = visible.prefix(while: { $0.id != fresh.id }).contains {
            NSRect(x: $0.bounds.x, y: primary.frame.maxY - $0.bounds.y - $0.bounds.height,
                   width: $0.bounds.width, height: $0.bounds.height).intersects(clipped)
        }
        panel.setFrame(clipped, display: false)
        pointer.drawingOrigin = NSPoint(x: frame.minX - clipped.minX, y: clipped.maxY - frame.maxY)
        pointer.needsDisplay = true
        if !confirming, !covered, NSWorkspace.shared.frontmostApplication?.processIdentifier == fresh.pid {
            panel.orderFront(nil)
        } else { panel.orderOut(nil) }
        state = CursorState(visible: panel.isVisible, displayID: screenID(screen), x: x, y: y)
        return true
    }

    private func expire(after seconds: Double) {
        expiration?.cancel()
        expiration = Task {
            do { try await Task.sleep(for: .seconds(seconds)) } catch { return }
            hide()
        }
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
        case "windows":
            return CursorReply(id: command.id, ok: true, state: currentState(), windows: windows())
        case "select_window":
            guard let id = command.windowID, let window = windows(id).first else {
                return CursorReply(id: command.id, ok: false, error: "Window is unavailable. List windows again; never fall back to another window.")
            }
            hide()
            selected = window
            invalidateObservation()
            readApproved = nil
            state = CursorState(visible: false, displayID: nil, x: nil, y: nil)
            return CursorReply(id: command.id, ok: true, state: currentState())
        case "release_window":
            releaseWindow()
            return CursorReply(id: command.id, ok: true, state: currentState())
        case "permissions", "observe_window", "click", "type_text":
            do { return try windowAction(command) }
            catch { return CursorReply(id: command.id, ok: false, error: error.localizedDescription) }
        case "move_window":
            guard let id = command.windowID, id == selected?.id,
                  let x = command.x, let y = command.y,
                  let seconds = command.seconds, seconds.isFinite, (1...30).contains(seconds) else {
                return CursorReply(id: command.id, ok: false, error: "Select this exact window first. Use window-local points and seconds in 1...30.")
            }
            guard placeWindowPointer(x: x, y: y) else {
                hide()
                return CursorReply(id: command.id, ok: false, error: "Window is unavailable or coordinates are outside the visible window. Refresh windows; do not retry elsewhere.")
            }
            tracking?.cancel()
            tracking = Task {
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .milliseconds(150)) } catch { return }
                    if !placeWindowPointer(x: x, y: y) { releaseWindow(); return }
                }
            }
            expire(after: seconds)
            return CursorReply(id: command.id, ok: true, state: currentState())
        case "move":
            guard selected == nil else {
                return CursorReply(id: command.id, ok: false, error: "A window is bound. Use move_window or explicitly release_window first.")
            }
            guard let screen = NSScreen.screens.first(where: { screenID($0) == command.displayID }),
                  let x = command.x, let y = command.y, x.isFinite, y.isFinite,
                  x >= 0, y >= 0, x < screen.frame.width, y < screen.frame.height,
                  let seconds = command.seconds, seconds.isFinite, (1...30).contains(seconds) else {
                return CursorReply(id: command.id, ok: false,
                                   error: "Invalid display or coordinates. Use display-local logical points and seconds in 1...30.")
            }
            expiration?.cancel()
            desktopOwner = NSWorkspace.shared.frontmostApplication?.processIdentifier
            // Tool coordinates start at the selected display's top-left, in points, not Retina pixels.
            pointer.drawingOrigin = .zero
            panel.setFrame(NSRect(x: screen.frame.minX + x - CursorView.hotspot.x,
                                  y: screen.frame.maxY - y - (CursorView.canvas.height - CursorView.hotspot.y),
                                  width: CursorView.canvas.width, height: CursorView.canvas.height), display: false)
            pointer.needsDisplay = true
            panel.orderFront(nil)
            state = CursorState(visible: true, displayID: screenID(screen), x: x, y: y)
            expire(after: seconds)
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
private extension CursorController {
    func invalidateObservation() {
        observationID = nil
        observedWindow = nil
        controls.removeAll()
    }

    func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value
    }

    func axElement(_ value: CFTypeRef?) -> AXUIElement? {
        guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
        // SAFETY: AX's runtime type ID has been checked before bridging the opaque CF reference.
        return unsafeDowncast(value, to: AXUIElement.self)
    }

    func position(_ element: AXUIElement) -> CGPoint? {
        guard let raw = attribute(element, kAXPositionAttribute), CFGetTypeID(raw) == AXValueGetTypeID() else { return nil }
        // SAFETY: AXValueGetTypeID checked above; AXValueGetValue also verifies the requested payload type.
        let value = unsafeDowncast(raw, to: AXValue.self)
        var point = CGPoint.zero
        return AXValueGetValue(value, .cgPoint, &point) ? point : nil
    }

    func size(_ element: AXUIElement) -> CGSize? {
        guard let raw = attribute(element, kAXSizeAttribute), CFGetTypeID(raw) == AXValueGetTypeID() else { return nil }
        // SAFETY: AXValueGetTypeID checked above; AXValueGetValue verifies CGSize payloads.
        let value = unsafeDowncast(raw, to: AXValue.self)
        var size = CGSize.zero
        return AXValueGetValue(value, .cgSize, &size) ? size : nil
    }

    func settable(_ element: AXUIElement, _ name: String) -> Bool {
        var allowed = DarwinBoolean(false)
        return AXUIElementIsAttributeSettable(element, name as CFString, &allowed) == .success && allowed.boolValue
    }

    func label(_ element: AXUIElement) -> String {
        let subrole = attribute(element, kAXSubroleAttribute) as? String
        if subrole == kAXSecureTextFieldSubrole { return "Secure input (value omitted)" }
        return String(((attribute(element, kAXTitleAttribute) as? String)
                       ?? (attribute(element, kAXDescriptionAttribute) as? String) ?? "").prefix(160))
    }

    func exactWindow(_ id: UInt32?) throws -> (WindowInfo, AXUIElement) {
        guard AXIsProcessTrusted() else {
            throw OpenUseError("需要 macOS 辅助功能授权。请由用户手动授权 open-use doctor 显示的原生程序，然后重新连接；模型不得替用户修改系统权限。")
        }
        guard let bound = selected, id == bound.id,
              let fresh = windows(bound.id).first, fresh.pid == bound.pid else {
            releaseWindow()
            throw OpenUseError("绑定窗口已失效。重新列出并明确选择窗口；不会回退到其他窗口。")
        }
        let app = AXUIElementCreateApplication(fresh.pid)
        AXUIElementSetMessagingTimeout(app, 0.5)
        guard let candidates = attribute(app, kAXWindowsAttribute) as? [AXUIElement] else {
            throw OpenUseError("目标应用没有提供可访问性窗口，不能安全操作。")
        }
        let matches = candidates.filter { candidate in
            guard let point = position(candidate), let dimensions = size(candidate) else { return false }
            return abs(point.x - fresh.bounds.x) < 1 && abs(point.y - fresh.bounds.y) < 1
                && abs(dimensions.width - fresh.bounds.width) < 1 && abs(dimensions.height - fresh.bounds.height) < 1
        }
        guard matches.count == 1, let window = matches.first else {
            throw OpenUseError("无法唯一匹配此窗口的可访问性对象，已停止；不会选择第一个候选窗口。")
        }
        selected = fresh
        return (fresh, window)
    }

    func belongs(_ element: AXUIElement, to window: AXUIElement) -> Bool {
        var current: AXUIElement? = element
        for _ in 0..<32 {
            guard let element = current else { return false }
            if CFEqual(element, window) { return true }
            current = axElement(attribute(element, kAXParentAttribute))
        }
        return false
    }

    func observe(_ id: UInt32?) throws -> WindowObservation {
        let (bound, window) = try exactWindow(id)
        if readApproved != bound.id {
            try confirm("读取此窗口的控件结构和静态文字，并返回模型会话。输入框内容不读取，安全字段不展开。", window: bound)
            let (_, fresh) = try exactWindow(id)
            guard CFEqual(fresh, window) else { throw OpenUseError("确认期间目标窗口发生变化，请重新选择。") }
            readApproved = bound.id
        }
        invalidateObservation()
        let token = UUID().uuidString
        var rows: [ObservedControl] = []
        func visit(_ element: AXUIElement, parent: Int?, depth: Int) {
            guard depth <= 12, rows.count < 160 else { return }
            let index = rows.count
            let role = attribute(element, kAXRoleAttribute) as? String ?? "unknown"
            let secure = (attribute(element, kAXSubroleAttribute) as? String) == kAXSecureTextFieldSubrole
            let enabled = attribute(element, kAXEnabledAttribute) as? Bool
            var names: CFArray?
            AXUIElementCopyActionNames(element, &names)
            let bounds: WindowBounds?
            if let point = position(element), let dimensions = size(element) {
                bounds = WindowBounds(x: point.x - bound.bounds.x, y: point.y - bound.bounds.y,
                                      width: dimensions.width, height: dimensions.height)
            } else { bounds = nil }
            controls[index] = element
            rows.append(ObservedControl(id: index, parent: parent, role: role, label: label(element),
                                        text: role == kAXStaticTextRole && !secure
                                            ? (attribute(element, kAXValueAttribute) as? String).map { String($0.prefix(160)) } : nil,
                                        actions: names as? [String] ?? [],
                                        enabled: enabled,
                                        editable: !secure && enabled != false && settable(element, kAXSelectedTextAttribute), bounds: bounds))
            if !secure, let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] {
                for child in children { visit(child, parent: index, depth: depth + 1) }
            }
        }
        visit(window, parent: nil, depth: 0)
        observationID = token
        observedWindow = window
        return WindowObservation(id: token, windowID: bound.id, elements: rows, truncated: rows.count >= 160)
    }

    func confirm(_ summary: String, window: WindowInfo, text: String? = nil) throws {
        guard !confirming else { throw OpenUseError("已有本地确认正在等待，请勿并发提交真实操作。") }
        confirming = true
        defer { confirming = false }
        panel.orderOut(nil)
        let alert = NSAlert()
        alert.messageText = "允许 Open Use 执行这一次操作吗？"
        alert.informativeText = "应用：\(window.app)\n窗口：\(window.title ?? "标题不可用")（ID \(window.id)）\n\(summary)\n\n仅对当前绑定窗口执行一次；模型不能批准此对话框。"
        if let text {
            let preview = NSTextView(frame: NSRect(x: 0, y: 0, width: 420, height: 120))
            preview.isEditable = false
            preview.isRichText = false
            preview.font = .systemFont(ofSize: 13)
            preview.string = text
            let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: 420, height: 120))
            scroll.hasVerticalScroller = true
            scroll.documentView = preview
            alert.accessoryView = scroll
        }
        alert.addButton(withTitle: "允许一次")
        alert.addButton(withTitle: "拒绝")
        guard alert.runModal() == .alertFirstButtonReturn else { throw OpenUseError("用户拒绝操作，未发送输入。不得自动重试。") }
    }

    func windowAction(_ command: CursorCommand) throws -> CursorReply {
        if command.action == "permissions" {
            return CursorReply(id: command.id, ok: true, permissions: InputPermissions(
                inputEnabled: allowInput, accessibility: AXIsProcessTrusted(), executable: CommandLine.arguments[0]))
        }
        if command.action == "observe_window" {
            return CursorReply(id: command.id, ok: true, observation: try observe(command.windowID))
        }
        guard allowInput else { throw OpenUseError("真实输入默认关闭。必须由用户在本地使用 --allow-input 启动 MCP；模型不能通过工具参数开启。") }
        let (bound, window) = try exactWindow(command.windowID)
        guard let token = command.observationID, token == observationID,
              let previous = observedWindow, CFEqual(previous, window),
              let index = command.elementID, let element = controls[index], belongs(element, to: window) else {
            throw OpenUseError("控件观察已过期或不属于此窗口。请重新 observe_window，不能复用旧编号。")
        }
        if (attribute(element, kAXSubroleAttribute) as? String) == kAXSecureTextFieldSubrole {
            throw OpenUseError("安全输入框必须由用户手动填写。")
        }
        guard (attribute(element, kAXEnabledAttribute) as? Bool) != false else {
            throw OpenUseError("此控件已禁用，未执行操作。请等待控件可用后重新观察。")
        }
        let originalLabel = label(element)
        if command.action == "click" {
            var actions: CFArray?
            AXUIElementCopyActionNames(element, &actions)
            guard (actions as? [String])?.contains(kAXPressAction) == true else {
                throw OpenUseError("此控件不支持可访问性点击；不使用全局鼠标点击兜底。")
            }
        } else {
            guard let text = command.text, !text.isEmpty, text.utf16.count <= 4000,
                  settable(element, kAXSelectedTextAttribute) else {
                throw OpenUseError("此控件不支持安全的选区插入，或文本为空/过长；不覆盖整个字段，也不回退到全局键盘输入。")
            }
        }
        try confirm(command.action == "click" ? "点击控件：\(originalLabel)" : "向控件 \(index)（\(originalLabel)）的当前选区插入下方文字（不发送回车键）。", window: bound,
                    text: command.action == "type_text" ? command.text : nil)
        let (_, current) = try exactWindow(command.windowID)
        guard observationID == token, CFEqual(current, window), belongs(element, to: current), label(element) == originalLabel else {
            throw OpenUseError("确认期间窗口或控件发生变化，未执行操作，请重新观察。")
        }
        guard (attribute(element, kAXSubroleAttribute) as? String) != kAXSecureTextFieldSubrole else {
            throw OpenUseError("确认期间控件变成了安全输入框，必须交给用户手动填写。")
        }
        guard (attribute(element, kAXEnabledAttribute) as? Bool) != false else {
            throw OpenUseError("确认期间控件已禁用，未执行操作，请重新观察。")
        }
        // Consume the observation before the side effect: even a partial/unknown failure must not be replayed blindly.
        invalidateObservation()
        if command.action == "click" {
            guard AXUIElementPerformAction(element, kAXPressAction as CFString) == .success else {
                throw OpenUseError("点击返回失败，执行结果不确定。重新观察，禁止自动重试。")
            }
            return CursorReply(id: command.id, ok: true, realInput: true, action: "accessibility_press", verified: false)
        }
        guard let text = command.text,
              AXUIElementSetAttributeValue(element, kAXSelectedTextAttribute as CFString, text as CFString) == .success else {
            throw OpenUseError("文本插入返回失败，结果不确定。重新观察，禁止自动重试。")
        }
        return CursorReply(id: command.id, ok: true, realInput: true, action: "insert_selected_text", verified: false)
    }
}

@MainActor
func main() {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let asset = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().appendingPathComponent("cursor-arrow.png")
    guard let image = NSImage(contentsOf: asset), image.isValid else {
        FileHandle.standardError.write(Data("Open Use: cursor-arrow.png is missing or invalid; reconnect from the source checkout.\n".utf8))
        exit(1)
    }
    if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--preview" {
        let view = CursorView(image: image)
        guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { exit(1) }
        view.cacheDisplay(in: view.bounds, to: bitmap)
        guard let png = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
        do { try png.write(to: URL(fileURLWithPath: CommandLine.arguments[2])) }
        catch { FileHandle.standardError.write(Data("Open Use: cannot write preview\n".utf8)); exit(1) }
        return
    }
    let controller = CursorController(allowInput: CommandLine.arguments.contains("--allow-input"), image: image)
    // File descriptor callbacks bridge into the single AppKit actor; no UI state leaves it.
    FileHandle.standardInput.readabilityHandler = { handle in
        let data = handle.availableData
        Task { @MainActor in controller.receive(data) }
    }
    app.run()
}

main()
