import { connectClientMcp, type ClientMcpConnection } from "@opencode/client/mcp"
import { createContext, createEffect, onCleanup, untrack, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Keymap } from "./keymap"
import { useStorage } from "./storage"
import { useTuiLifecycle } from "./runtime"
import { useClient } from "./client"
import { useLocation } from "./location"
import { useData } from "./data"
import { useRoute } from "./route"
import { useToast } from "../ui/toast"
import { useDialog } from "../ui/dialog"
import { DialogConfirm } from "../ui/dialog-confirm"
import type { OpenUseBridge, OpenUseHost, OpenUseScope } from "../open-use"

const permissionMessage =
  "仅需「辅助功能」：读取所选窗口控件、点击和输入。\n" +
  "无需屏幕录制、输入监控或麦克风权限。" +
  "\n首次开启将打开系统设置，请手动授权 OpenUse 或系统提示的启动终端。\n" +
  "界面静态文字会进入模型会话；真实动作仍需逐次本机确认。\n" +
  "关闭会停用本客户端工具；独立配置的 MCP 请在 /mcp 管理。"

type Phase = "off" | "preparing" | "permission" | "connecting" | "on" | "error"
const Context = createContext<{
  readonly available: boolean
  readonly phase: Phase
  toggle(): Promise<void>
  recheck(): Promise<void>
}>()

export function OpenUseProvider(props: ParentProps<{ host?: OpenUseHost; scope: () => OpenUseScope }>) {
  const storage = useStorage()
  const toast = useToast()
  const dialog = useDialog()
  const lifecycle = useTuiLifecycle()
  const [settings, update] = storage.store("lychee-open-use", { initial: { enabled: false, onboarded: false } })
  const [view, setView] = createStore({ phase: "off" as Phase, executable: "", desired: settings.enabled })
  let generation = 0
  let disposed = false
  let active: OpenUseBridge | undefined
  let connection: ClientMcpConnection | undefined
  let interactive = false
  let first = false
  let key: string | undefined

  const retire = async () => {
    generation++
    const bridge = active
    active = undefined
    const previous = connection
    connection = undefined
    // close() revokes the local native process synchronously before waiting on SDK cleanup.
    const closing = bridge?.close()
    await previous?.close()
    await closing
  }
  const valid = (token: number) => !disposed && token === generation && view.desired && settings.enabled

  const activate = async (scope: OpenUseScope, userInitiated: boolean, firstEnable: boolean) => {
    const closing = retire()
    const token = generation
    setView("phase", "preparing")
    try {
      await closing
      if (!valid(token) || !props.host) return
      const bridge = await props.host.prepare()
      if (!valid(token)) {
        await bridge.close()
        return
      }
      active = bridge
      const permissions = await bridge.permissions()
      if (!valid(token)) return
      setView("executable", permissions.executable)
      if (userInitiated && (firstEnable || !permissions.accessibility)) await props.host.openSettings()
      if (!valid(token)) return
      if (!permissions.accessibility) {
        const stopping = retire()
        const stopped = generation
        await stopping
        if (disposed || generation !== stopped || !view.desired) return
        setView("phase", "permission")
        toast.show({
          variant: "info",
          message:
            "请手动开启「辅助功能」，然后点击旁边的「检查」。无需录屏或输入监控权限；/open-use-permissions 可查看原生程序路径。",
          duration: 8000,
        })
        return
      }
      setView("phase", "connecting")
      connection = connectClientMcp({
        ...scope,
        name: "open_use_tui",
        instructions: bridge.instructions,
        tools: bridge.tools.map((tool) => ({
          ...tool,
          handler(args, context) {
            if (!valid(token) || view.phase !== "on" || !scope.sessionID || context.sessionID !== scope.sessionID)
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "Open Use is not enabled for this active TUI session. Do not use another session or reconnect without the user.",
                  },
                ],
              }
            return tool.handler(args, context)
          },
        })),
        onStatus(connected) {
          if (valid(token)) setView("phase", connected ? "on" : "connecting")
        },
      })
    } catch (error) {
      if (!valid(token)) return
      const stopping = retire()
      const stopped = generation
      await stopping
      if (disposed || generation !== stopped || !view.desired) return
      setView("phase", "error")
      toast.error(error)
    }
  }

  const confirmFirstEnable = () =>
    new Promise<boolean>((resolve) => {
      dialog.replace(
        () => (
          <DialogConfirm
            title="开启 Open Use"
            message={permissionMessage}
            label={{ confirm: "开启并前往设置", cancel: "暂不开启" }}
            onConfirm={() => resolve(true)}
            onCancel={() => resolve(false)}
          />
        ),
        () => resolve(false),
      )
    })

  const toggle = async () => {
    if (!props.host || disposed) return
    if (view.desired) {
      setView("desired", false)
      setView("phase", "off")
      const stopped = retire()
      await update((draft) => {
        draft.enabled = false
      })
      await stopped
      return
    }
    if (!settings.onboarded && !(await confirmFirstEnable())) return
    if (disposed) return
    interactive = true
    first = !settings.onboarded
    setView("desired", true)
    try {
      await update((draft) => {
        draft.enabled = true
        draft.onboarded = true
      })
    } catch (error) {
      setView("desired", false)
      throw error
    }
  }

  const recheck = async () => {
    if (!props.host || disposed || !view.desired) return
    await activate(props.scope(), true, false)
  }

  const permissions = () =>
    dialog.replace(() => (
      <DialogConfirm
        title="Open Use 权限说明"
        message={`${permissionMessage}\n\n原生程序：${view.executable || "开启后显示本机路径"}\n授权后点击「检查」重新检查，无需重启 AI 服务。`}
        label={{ confirm: "打开权限设置", cancel: "关闭" }}
        onConfirm={() => {
          void props.host?.openSettings().catch((error) => toast.error(error))
        }}
      />
    ))

  Keymap.createLayer(() => ({
    mode: "global",
    commands: props.host
      ? [
          {
            id: "lychee.open-use.toggle",
            palette: true,
            title: view.desired ? "关闭 Open Use" : "开启 Open Use",
            group: "Lychee",
            slash: { name: "open-use" },
            run: () => {
              void toggle().catch((error) => toast.error(error))
            },
          },
          {
            id: "lychee.open-use.permissions",
            palette: true,
            title: "Open Use 权限说明",
            group: "Lychee",
            slash: { name: "open-use-permissions" },
            run: permissions,
          },
          {
            id: "lychee.open-use.check",
            palette: true,
            title: "重新检查 Open Use 权限",
            group: "Lychee",
            slash: { name: "open-use-check" },
            run: () => {
              void recheck().catch((error) => toast.error(error))
            },
          },
        ]
      : [],
  }))

  createEffect(() => {
    const scope = props.scope()
    const next = view.desired && settings.enabled && props.host ? JSON.stringify(scope) : undefined
    if (next === key) return
    key = next
    untrack(() => {
      if (!next) {
        setView("phase", "off")
        void retire()
        return
      }
      const triggered = interactive
      const onboarding = first
      interactive = false
      first = false
      void activate(scope, triggered, onboarding)
    })
  })
  const finish = async () => {
    disposed = true
    await retire()
  }
  const unregister = lifecycle.add(finish)
  onCleanup(() => {
    unregister()
    void finish()
  })

  return (
    <Context.Provider
      value={{
        available: !!props.host,
        get phase() {
          return view.phase
        },
        toggle,
        recheck,
      }}
    >
      {props.children}
    </Context.Provider>
  )
}

export function OpenUseRuntime(props: ParentProps<{ host?: OpenUseHost }>) {
  const client = useClient()
  const route = useRoute()
  const location = useLocation()
  const data = useData()
  return (
    <OpenUseProvider
      host={props.host}
      scope={() => ({
        url: client.url ?? "",
        headers: client.headers,
        directory: location.ref?.directory ?? data.location.default().directory,
        sessionID: route.data.type === "session" ? route.data.sessionID : undefined,
      })}
    >
      {props.children}
    </OpenUseProvider>
  )
}

export function useOpenUse() {
  return useContext(Context)
}
