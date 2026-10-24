/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { createSignal, onMount } from "solid-js"
import { Schema } from "effect"
import { OpenUseProvider } from "../../src/context/open-use"
import { OpenUseToggle } from "../../src/component/prompt/open-use"
import { TuiAppProvider, TuiLifecycleProvider } from "../../src/context/runtime"
import { StorageProvider } from "../../src/context/storage"
import { ConfigProvider } from "../../src/config"
import { Keymap } from "../../src/context/keymap"
import { ThemeProvider } from "../../src/context/theme"
import { ToastProvider } from "../../src/ui/toast"
import { DialogProvider } from "../../src/ui/dialog"
import { emptyThemeSource, tmpdir } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import type { OpenUseBridge, OpenUseHost, OpenUseScope } from "../../src/open-use"
import { createAppFixture } from "../fixture/app"

const decode = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      id: Schema.Number,
      result: Schema.optional(Schema.Unknown),
      error: Schema.optional(Schema.Unknown),
    }),
  ),
)

async function start(width: number, supported = true) {
  const temporary = await tmpdir()
  const mounted = Promise.withResolvers<void>()
  const finalizers = new Set<() => Promise<void>>()
  const records: Array<{ closed: boolean; calls: number; disposed: ReturnType<typeof Promise.withResolvers<void>> }> =
    []
  const hardware = { authorized: false, settingsOpened: 0, pause: undefined as Promise<void> | undefined }
  let prepared = Promise.withResolvers<void>()
  const responses = new Map<number, ReturnType<typeof Promise.withResolvers<unknown>>>()
  let nextID = 10
  type Peer = { call: (sessionID: string) => Promise<unknown>; closed: Promise<void>; initialized: unknown; url: URL }
  const peers: Peer[] = []
  const waiting: Array<(peer: Peer) => void> = []
  const server = Bun.serve({
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request, { data: { url: new URL(request.url), close: Promise.withResolvers<void>() } })) return
      return new Response("upgrade required", { status: 426 })
    },
    websocket: {
      data: {} as { url: URL; close: ReturnType<typeof Promise.withResolvers<void>> },
      open(socket) {
        const response = Promise.withResolvers<unknown>()
        const id = ++nextID
        responses.set(id, response)
        socket.send(
          JSON.stringify({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: "2025-11-25" } }),
        )
        void response.promise.then((initialized) => {
          socket.send(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))
          const peer: Peer = {
            initialized,
            url: socket.data.url,
            closed: socket.data.close.promise,
            call(sessionID) {
              const id = ++nextID
              const response = Promise.withResolvers<unknown>()
              responses.set(id, response)
              socket.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id,
                  method: "tools/call",
                  params: {
                    name: "guide",
                    arguments: {},
                    _meta: { "ai.opencode/sessionID": sessionID },
                  },
                }),
              )
              return response.promise
            },
          }
          const resolve = waiting.shift()
          if (resolve) resolve(peer)
          else peers.push(peer)
        })
      },
      message(_socket, data) {
        const raw = String(data)
        setImmediate(() => {
          const message = decode(raw)
          const response = responses.get(message.id)
          responses.delete(message.id)
          if (message.error !== undefined) response?.reject(new Error(JSON.stringify(message.error)))
          else response?.resolve(message.result)
        })
      },
      close(socket) {
        socket.data.close.resolve()
      },
    },
  })
  const [scope, setScope] = createSignal<OpenUseScope>({
    url: server.url.toString(),
    directory: temporary.path,
    sessionID: "ses_visible",
  })
  const host: OpenUseHost = {
    async prepare() {
      const record = { closed: false, calls: 0, disposed: Promise.withResolvers<void>() }
      records.push(record)
      prepared.resolve()
      if (hardware.pause) await hardware.pause
      const bridge: OpenUseBridge = {
        instructions: "Open Use fixture: only the active local session may call tools.",
        tools: [
          {
            name: "guide",
            handler() {
              record.calls++
              return { content: [{ type: "text", text: "local guide" }] }
            },
          },
        ],
        async permissions() {
          return { accessibility: hardware.authorized, executable: "/fixture/OpenUse" }
        },
        async close() {
          record.closed = true
          record.disposed.resolve()
        },
      }
      return bridge
    },
    async openSettings() {
      hardware.settingsOpened++
    },
  }
  function Content() {
    onMount(mounted.resolve)
    return (
      <box flexDirection="row">
        <text>语音 </text>
        <OpenUseToggle />
      </box>
    )
  }
  const app = await testRender(
    () => (
      <TestTuiContexts paths={{ state: temporary.path, home: temporary.path }}>
        <TuiAppProvider value={{ name: "test", version: "test", channel: "test" }}>
          <TuiLifecycleProvider
            value={{
              add(finalizer) {
                finalizers.add(finalizer)
                return () => finalizers.delete(finalizer)
              },
            }}
          >
            <StorageProvider>
              <ConfigProvider config={createTuiResolvedConfig({ animations: false })}>
                <ThemeProvider mode="dark" source={emptyThemeSource}>
                  <Keymap.Provider>
                    <ToastProvider>
                      <DialogProvider>
                        <OpenUseProvider host={supported ? host : undefined} scope={scope}>
                          <Content />
                        </OpenUseProvider>
                      </DialogProvider>
                    </ToastProvider>
                  </Keymap.Provider>
                </ThemeProvider>
              </ConfigProvider>
            </StorageProvider>
          </TuiLifecycleProvider>
        </TuiAppProvider>
      </TestTuiContexts>
    ),
    { width, height: 40, kittyKeyboard: true },
  )
  app.renderer.start()
  await mounted.promise
  await app.waitForFrame((frame) => frame.includes("语音"))
  return {
    ...app,
    hardware,
    records,
    setScope,
    nextPeer() {
      const peer = peers.shift()
      if (peer) return Promise.resolve(peer)
      return new Promise<Peer>((resolve) => waiting.push(resolve))
    },
    preparing() {
      prepared = Promise.withResolvers<void>()
      return prepared.promise
    },
    async click(id = "prompt.footer.open-use") {
      app.renderer.clearSelection()
      const button = app.renderer.root.findDescendantById(id)
      if (!button) throw new Error(`Missing button ${id}`)
      await app.mockMouse.click(button.x + 1, button.y)
    },
    async [Symbol.asyncDispose]() {
      await Promise.all([...finalizers].map((finish) => finish()))
      app.renderer.destroy()
      await server.stop(true)
      await temporary[Symbol.asyncDispose]()
    },
  }
}

test.each([
  { width: 100, supported: true },
  { width: 44, supported: true },
  { width: 44, supported: false },
])("Open Use footer visibility at $width columns, supported=$supported", async ({ width, supported }) => {
  await using app = await start(width, supported)
  expect(app.captureCharFrame().includes("Open Use 关")).toBe(supported)
  expect(app.records).toHaveLength(0)
})

test.each([100, 44])(
  "real prompt footer exposes the macOS control at %s columns without starting it",
  async (width) => {
    let calls = 0
    await using app = await createAppFixture({
      width,
      openUse: {
        async prepare() {
          calls++
          throw new Error("must not prepare before opt-in")
        },
        async openSettings() {
          calls++
        },
      },
    })
    await app.ready
    await app.waitForFrame((frame) => frame.includes("Open Use 关"))
    const button = app.renderer.root.findDescendantById("prompt.footer.open-use")
    if (!button) throw new Error("Open Use footer missing")
    expect(button.x).toBeGreaterThanOrEqual(0)
    expect(button.x + button.width).toBeLessThanOrEqual(width)
    expect(calls).toBe(0)
  },
)

test("onboarding, permission recheck, exact-session tool routing, shutdown and pending-enable cancellation", async () => {
  await using app = await start(100)
  await app.click()
  await app.waitForFrame((frame) => frame.includes("仅需「辅助功能」"))
  expect(app.captureCharFrame()).toContain("无需屏幕录制、输入监控或麦克风权限")
  app.mockInput.pressEscape()
  await app.waitForFrame((frame) => !frame.includes("开启并前往设置"))
  expect(app.hardware.settingsOpened).toBe(0)
  expect(app.records).toHaveLength(0)

  await app.click()
  await app.waitForFrame((frame) => frame.includes("开启并前往设置"))
  app.mockInput.pressEnter()
  await app.waitForFrame((frame) => frame.includes("Open Use 待授权"))
  expect(app.hardware.settingsOpened).toBe(1)
  expect(app.records[0].closed).toBe(true)

  app.hardware.authorized = true
  await app.click("prompt.footer.open-use.check")
  const first = await app.nextPeer()
  await app.waitForFrame((frame) => frame.includes("Open Use 开"))
  expect(first.url.searchParams.get("name")).toBe("open_use_tui")
  expect(first.url.searchParams.get("location[directory]")).toBeDefined()
  expect(first.initialized).toMatchObject({ instructions: expect.stringContaining("active local session") })
  expect(await first.call("ses_other")).toMatchObject({ isError: true })
  expect(app.records[1].calls).toBe(0)
  expect(await first.call("ses_visible")).toMatchObject({ content: [{ text: "local guide" }] })
  expect(app.hardware.settingsOpened).toBe(1)

  app.setScope((previous) => ({ ...previous, sessionID: "ses_next" }))
  const second = await app.nextPeer()
  await app.waitForFrame((frame) => frame.includes("Open Use 开"))
  expect(app.records[1].closed).toBe(true)
  expect(await second.call("ses_visible")).toMatchObject({ isError: true })
  expect(await second.call("ses_next")).toMatchObject({ content: [{ text: "local guide" }] })
  await app.click()
  await second.closed
  await app.waitForFrame((frame) => frame.includes("Open Use 关"))
  expect(app.records[2].closed).toBe(true)

  const gate = Promise.withResolvers<void>()
  app.hardware.pause = gate.promise
  const preparing = app.preparing()
  await app.click()
  await preparing
  await app.waitForFrame((frame) => frame.includes("Open Use 准备中"))
  await app.click()
  await app.waitForFrame((frame) => frame.includes("Open Use 关"))
  gate.resolve()
  await app.records[3].disposed.promise
  expect(app.records[3].closed).toBe(true)
  expect(app.hardware.settingsOpened).toBe(1)
})
