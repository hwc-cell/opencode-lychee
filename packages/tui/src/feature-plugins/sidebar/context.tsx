import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createEffect, createMemo, createSignal, Show } from "solid-js"
import { t } from "../../i18n"
import { useSDK } from "../../context/sdk"

const id = "internal:sidebar-context"

const USD_TO_CNY = 7.25

function formatCNY(amount: number, currency?: string | null) {
  const cny = currency === "USD" ? amount * USD_TO_CNY : amount
  return `¥${cny.toFixed(2)}`
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const sdk = useSDK()
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const cost = createMemo(() => session()?.cost ?? 0)
  const [balance, setBalance] = createSignal<
    { supported: boolean; currency?: string | null; amount?: string | null } | undefined
  >()

  createEffect(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) return
    let cancelled = false
    sdk.client.provider
      .balance({ providerID: last.providerID })
      .then((res) => {
        if (!cancelled) setBalance(res.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  })

  const balanceText = createMemo(() => {
    const value = balance()
    if (!value?.supported || !value.amount) return
    const amount = Number(value.amount)
    const cny = value.currency === "USD" ? amount * USD_TO_CNY : amount
    return cny.toFixed(2)
  })

  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return {
        tokens: 0,
        percent: null,
      }
    }

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    return {
      tokens,
      percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : null,
    }
  })

  return (
    <box>
      <text fg={theme().text}>
        <b>{t("sidebar.context")}</b>
      </text>
      <text fg={theme().textMuted}>{t("sidebar.tokens", { tokens: state().tokens.toLocaleString() })}</text>
      <text fg={theme().textMuted}>{t("sidebar.percentUsed", { percent: state().percent ?? 0 })}</text>
      <text fg={theme().textMuted}>{t("sidebar.spent", { cost: formatCNY(cost()) })}</text>
      <Show when={balanceText()}>
        {(text) => (
          <text fg={theme().textMuted}>{t("sidebar.balance", { amount: text() })}</text>
        )}
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
