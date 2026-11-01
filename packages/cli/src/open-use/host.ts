import { Client, InMemoryTransport } from "@modelcontextprotocol/client"
import { Schema } from "effect"
import { spawn } from "node:child_process"
import { createOpenUseServer } from "./server"
import type { OpenUseBridge } from "@opencode/tui"

const decodeResult = Schema.decodeUnknownSync(
  Schema.Struct({
    content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })),
    isError: Schema.optional(Schema.Boolean),
  }),
)

export async function prepareOpenUse(): Promise<OpenUseBridge> {
  if (process.platform !== "darwin") throw new Error("Open Use 仅支持 macOS。")
  const use = createOpenUseServer({ allowInput: true })
  const client = new Client({ name: "open-use-tui", version: "0.2.0" })
  const [local, remote] = InMemoryTransport.createLinkedPair()
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    // Revoke native execution first, including any pending local confirmation dialog.
    use.close()
    await Promise.allSettled([client.close(), use.server.close()])
  }
  try {
    await Promise.all([use.server.connect(remote), client.connect(local)])
    const result = await client.listTools()
    return {
      disconnected: use.stopped,
      instructions: client.getInstructions() ?? "",
      tools: result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        async handler(args) {
          if (closed) return { isError: true, content: [{ type: "text", text: "Open Use is disabled in this TUI." }] }
          return decodeResult(await client.callTool({ name: tool.name, arguments: args }, { timeout: 300_000 }))
        },
      })),
      async permissions() {
        if (closed) throw new Error("Open Use 已关闭。")
        const result = await use.permissions()
        if (!result.permissions) throw new Error("Open Use 未返回权限检查结果。")
        return result.permissions
      },
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}

export async function openOpenUseSettings() {
  if (process.platform !== "darwin") throw new Error("Open Use 仅支持 macOS。")
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "/usr/bin/open",
      ["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"],
      { stdio: "ignore" },
    )
    child.once("error", reject)
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("无法打开系统设置，请手动进入「隐私与安全性 → 辅助功能」。")),
    )
  })
}
