import type { ClientMcpTool } from "@opencode/client/mcp"

export type OpenUseBridge = {
  readonly instructions: string
  readonly tools: ReadonlyArray<ClientMcpTool>
  permissions(): Promise<{ accessibility: boolean; executable: string }>
  close(): Promise<void>
}

// Implemented by the local macOS CLI host, never by the remote AI server.
export type OpenUseHost = {
  prepare(): Promise<OpenUseBridge>
  openSettings(): Promise<void>
}

export type OpenUseScope = {
  readonly url: string
  readonly headers?: Record<string, string>
  readonly directory: string
  readonly sessionID?: string
}
