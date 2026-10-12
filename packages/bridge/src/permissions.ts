import type { OpenCodeClient, PermissionRequest } from "@opencode/client"
import { t } from "./i18n"

type Client = Pick<OpenCodeClient, "permission">

function notice(request: PermissionRequest) {
  return t("permissionAsked", {
    id: request.id,
    action: request.action,
    resources: request.resources.join("\n").slice(0, 800),
  })
}

export async function notifyPermissions(args: {
  client: Client
  sessionID: string
  announced: Set<string>
  reply: (text: string) => Promise<void>
}) {
  const pending = await args.client.permission.list(
    { sessionID: args.sessionID },
    { signal: AbortSignal.timeout(5000) },
  )
  for (const request of pending) {
    if (request.sessionID !== args.sessionID) continue
    if (args.announced.has(request.id)) continue
    await args.reply(notice(request))
    args.announced.add(request.id)
  }
}

export async function handlePermissionCommand(args: {
  client: Client
  sessionID?: string
  text: string
  owner: boolean
  reply: (text: string) => Promise<void>
}) {
  const [command, requestID, ...extra] = args.text.trim().split(/\s+/)
  if (!["/permissions", "/approve", "/deny"].includes(command.toLowerCase())) return false
  if (!args.owner) {
    await args.reply(t("permissionOwnerOnly"))
    return true
  }
  if (!args.sessionID) {
    await args.reply(t("permissionNone"))
    return true
  }
  const pending = await args.client.permission.list(
    { sessionID: args.sessionID },
    { signal: AbortSignal.timeout(5000) },
  )
  if (command.toLowerCase() === "/permissions") {
    if (!pending.length) await args.reply(t("permissionNone"))
    for (const request of pending) await args.reply(notice(request))
    return true
  }
  if (!requestID || extra.length) {
    await args.reply(t("permissionUsage"))
    return true
  }
  if (!pending.some((request) => request.id === requestID && request.sessionID === args.sessionID)) {
    await args.reply(t("permissionExpired"))
    return true
  }
  await args.client.permission.reply(
    {
      sessionID: args.sessionID,
      requestID,
      decision: command.toLowerCase() === "/approve" ? "once" : "reject",
    },
    { signal: AbortSignal.timeout(5000) },
  )
  await args.reply(t(command.toLowerCase() === "/approve" ? "permissionApproved" : "permissionDenied"))
  return true
}
