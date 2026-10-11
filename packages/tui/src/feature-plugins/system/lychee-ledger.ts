import { Plugin } from "@opencode/plugin/tui"
import { buildSessionRecord, ledgerUpload, ledgerValidateKey, setLedgerKey } from "../../util/ledger"

export default Plugin.define({
  id: "lychee.ledger",
  setup(context) {
    const [settings, update] = context.storage.store("lychee-ledger", { initial: { enabled: false } })
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "lychee.ledger.toggle",
          title: settings.enabled ? "关闭荔枝自动记账" : "开启荔枝自动记账",
          group: "Lychee",
          slash: { name: "autolychee" },
          palette: true,
          async run() {
            const enabled = !settings.enabled
            await update((draft) => {
              draft.enabled = enabled
            })
            context.ui.dialog.clear()
            context.ui.toast.show({
              variant: enabled ? "success" : "info",
              message: enabled ? "已开启：退出 TUI 时同步本次 AI 成本" : "已关闭荔枝自动记账",
            })
          },
        },
        {
          id: "lychee.ledger.key",
          title: "设置荔枝记账 API Key",
          group: "Lychee",
          slash: { name: "ledger-key", arguments: true },
          palette: true,
          async run(input) {
            const key =
              input?.trim() ||
              (
                await context.ui.dialog.prompt({
                  title: "设置荔枝记账 API Key",
                  description: "Key 仅保存在本机 ~/.local/state/opencode/ledger.json",
                  placeholder: "粘贴 API Key",
                })
              )?.trim()
            if (!key) return
            if (!(await ledgerValidateKey(key))) {
              context.ui.toast.show({ variant: "error", message: "API Key 无效或网络不可用" })
              return
            }
            setLedgerKey(key)
            context.ui.dialog.clear()
            context.ui.toast.show({ variant: "success", message: "荔枝记账 API Key 已保存" })
          },
        },
      ],
    }))

    return async () => {
      if (!settings.enabled) return
      const route = context.ui.router.current()
      if (route.type !== "session") return
      const session = context.data.session.get(route.sessionID)
      if (!session) return
      const record = buildSessionRecord({
        sessionID: session.id,
        title: session.title ?? session.id,
        costUSD: session.cost,
      })
      if (!record) return
      process.stderr.write("\n🍈 正在同步本次 AI 成本到荔枝记账…\n")
      const result = await ledgerUpload([record])
      process.stderr.write(
        result.ok
          ? `🍈 已记账: ¥${(-record.amount).toFixed(2)} · ${record.note}\n`
          : `🍈 自动记账失败: ${result.message}\n`,
      )
    }
  },
})
