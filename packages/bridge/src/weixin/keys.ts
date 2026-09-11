import { createHash } from "node:crypto"
import type { WeixinMessage } from "./client"

export function conversationKey(accountId: string, msg: WeixinMessage) {
  if (msg.group_id) return `${accountId}#group:${msg.group_id}`
  return `${accountId}#${msg.from_user_id}`
}

export function messageKey(accountId: string, msg: WeixinMessage) {
  const id = msg.message_id ?? msg.seq
  if (id !== undefined) return `${conversationKey(accountId, msg)}#message:${id}`
  const digest = createHash("sha256").update(JSON.stringify(msg)).digest("hex").slice(0, 24)
  return `${conversationKey(accountId, msg)}#message:${digest}`
}

export function promptID(accountId: string, msg: WeixinMessage) {
  const digest = createHash("sha256").update(messageKey(accountId, msg)).digest("hex")
  return `msg_${digest}`
}
