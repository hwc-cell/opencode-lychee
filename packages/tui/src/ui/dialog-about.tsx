import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { useBindings } from "../keymap"
import { t } from "../i18n"

export function DialogAbout() {
  const dialog = useDialog()
  const { theme } = useTheme()

  useBindings(() => ({
    bindings: [
      { key: "return", desc: t("about.close.desc"), group: "Dialog", cmd: () => dialog.clear() },
      { key: "escape", desc: t("about.close.desc"), group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {t("about.title")}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc/enter
        </text>
      </box>
      <box paddingBottom={1} gap={1}>
        <text fg={theme.textMuted}>{t("about.body")}</text>
        <text fg={theme.text}>
          {"◈ "}
          {t("about.upstream.label")}: <span style={{ fg: theme.primary }}>{t("about.upstream.url")}</span>
        </text>
        <text fg={theme.text}>
          {"◈ "}
          {t("about.bilibili.label")}: <span style={{ fg: theme.primary }}>{t("about.bilibili.url")}</span>
        </text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>{t("alert.ok")}</text>
        </box>
      </box>
    </box>
  )
}
