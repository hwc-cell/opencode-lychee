import { MouseButton } from "@opentui/core"
import { Show } from "solid-js"
import { useOpenUse } from "../../context/open-use"
import { useTheme } from "../../context/theme"
import { useToast } from "../../ui/toast"

export function OpenUseToggle() {
  const control = useOpenUse()
  const theme = useTheme()
  const toast = useToast()
  const label = () =>
    control?.phase === "on"
      ? "开"
      : control?.phase === "permission"
        ? "待授权"
        : control?.phase === "error"
          ? "异常"
          : control?.phase === "preparing"
            ? "准备中"
            : control?.phase === "connecting"
              ? "连接中"
              : "关"
  return (
    <Show when={control?.available}>
      <box flexDirection="row" gap={1} flexShrink={0}>
        <text
          id="prompt.footer.open-use"
          selectable={false}
          wrapMode="none"
          flexShrink={0}
          fg={control?.phase === "on" ? theme.text.action.primary.base : theme.text.muted}
          onMouseUp={(event) => {
            if (event.button !== MouseButton.LEFT) return
            event.stopPropagation()
            void control?.toggle().catch((error) => toast.error(error))
          }}
        >
          ◉ Open Use {label()}
        </text>
        <Show when={control?.phase === "permission" || control?.phase === "error"}>
          <text
            id="prompt.footer.open-use.check"
            selectable={false}
            wrapMode="none"
            fg={theme.text.action.primary.base}
            onMouseUp={(event) => {
              if (event.button !== MouseButton.LEFT) return
              event.stopPropagation()
              void control?.recheck().catch((error) => toast.error(error))
            }}
          >
            [{control?.phase === "error" ? "重试" : "检查"}]
          </text>
        </Show>
      </box>
    </Show>
  )
}
