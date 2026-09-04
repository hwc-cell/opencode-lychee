import { createSignal, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { useBindings } from "../keymap"
import { t } from "../i18n"
import { useKV } from "../context/kv"
import { useClipboard } from "../context/clipboard"
import { useToast } from "./toast"
import { getLedgerKey, ledgerValidateKey, setLedgerKey } from "../util/ledger"

export function DialogAutolychee() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const kv = useKV()
  const clipboard = useClipboard()
  const toast = useToast()
  const [enabled, setEnabled] = createSignal(kv.get("autolychee", false))
  const [key, setKey] = createSignal<string | undefined>(getLedgerKey())
  const [busy, setBusy] = createSignal(false)

  useBindings(() => ({
    bindings: [
      { key: "return", desc: t("alert.confirm.desc"), group: "Dialog", cmd: () => dialog.clear() },
      { key: "escape", desc: t("alert.confirm.desc"), group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  const toggle = () => {
    kv.set("autolychee", !enabled())
    setEnabled(!enabled())
  }

  const pasteKey = async () => {
    setBusy(true)
    const content = await clipboard.read?.()
    const text = content?.mime === "text/plain" ? content.data : undefined
    const value = text?.trim()
    if (!value) {
      toast.show({ message: t("ledger.keyEmpty"), variant: "warning" })
      setBusy(false)
      return
    }
    if (await ledgerValidateKey(value)) {
      setLedgerKey(value)
      setKey(getLedgerKey())
      toast.show({ message: t("ledger.keySaved"), variant: "success" })
    } else {
      toast.show({ message: t("ledger.keyInvalid"), variant: "error" })
    }
    setBusy(false)
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {t("autolychee.title")}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc/enter
        </text>
      </box>
      <box paddingBottom={1} gap={1}>
        <text fg={theme.text}>
          <b>{t("autolychee.status")}</b>{" "}
          <span style={{ fg: enabled() ? theme.success : theme.textMuted }}>
            {enabled() ? t("autolychee.statusOn") : t("autolychee.statusOff")}
          </span>
        </text>
        <text fg={theme.text}>
          <b>{t("autolychee.key")}</b>{" "}
          <Show
            when={key()}
            fallback={
              <span style={{ fg: theme.warning }}>{t("autolychee.keyMissing")}</span>
            }
          >
            {(value) => (
              <span style={{ fg: theme.success }}>
                {t("autolychee.keySet", { prefix: value().slice(0, 8) })}
              </span>
            )}
          </Show>
        </text>
        <Show when={!key()}>
          <text fg={theme.textMuted}>{t("autolychee.keyHint")}</text>
        </Show>
        <text fg={theme.textMuted}>{t("autolychee.desc")}</text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" gap={1} paddingBottom={1}>
        <box
          paddingLeft={3}
          paddingRight={3}
          backgroundColor={enabled() ? theme.backgroundElement : theme.primary}
          onMouseUp={toggle}
        >
          <text fg={enabled() ? theme.textMuted : theme.selectedListItemText}>
            {enabled() ? t("autolychee.disable") : t("autolychee.enable")}
          </text>
        </box>
        <box
          paddingLeft={3}
          paddingRight={3}
          backgroundColor={theme.primary}
          onMouseUp={pasteKey}
        >
          <text fg={busy() ? theme.textMuted : theme.selectedListItemText}>
            {busy() ? t("autolychee.busy") : t("autolychee.pasteKey")}
          </text>
        </box>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>{t("alert.ok")}</text>
        </box>
      </box>
    </box>
  )
}
