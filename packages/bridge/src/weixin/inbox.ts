import type { WeixinMessage } from "./client"
import type { WeixinState } from "./state"
import { conversationKey, promptID } from "./keys"

export function queuedMessageID(accountId: string, message: WeixinMessage) {
  return promptID(accountId, message).slice(4, 16)
}

/** Acknowledged cancellation must survive a bridge restart. */
export function discardQueuedMessages(state: WeixinState, accountId: string, key: string, ids: string[]) {
  if (!state.inbox || !ids.length) return
  const cancelled = new Set(ids)
  for (const [id, message] of Object.entries(state.inbox)) {
    if (conversationKey(accountId, message) === key && cancelled.has(queuedMessageID(accountId, message)))
      delete state.inbox[id]
  }
  if (!Object.keys(state.inbox).length) delete state.inbox
}
