import { Client, InMemoryTransport } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { isolatedEnv } from "./fixture/environment"
import { createOpenUseServer } from "../src/open-use/server"

test("Open Use teaches its visual-only contract and rejects invalid control requests before opening UI", async () => {
  const use = createOpenUseServer()
  const client = new Client({ name: "open-use-test", version: "1.0.0" })
  const [local, remote] = InMemoryTransport.createLinkedPair()
  try {
    await Promise.all([use.server.connect(remote), client.connect(local)])
    expect(client.getInstructions()).toContain("ONLY displays an independent visual pointer")
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(["cursor", "displays", "guide", "hide", "state"])
    const guide = await client.callTool({ name: "guide", arguments: {} })
    const guideText = JSON.stringify(guide)
    expect(guideText).toContain("origin TOP LEFT")
    expect(guideText).toContain("Never describe a cursor move as a real click")
    for (const args of [
      { displayID: "1", x: -1, y: 0 },
      { displayID: "1", x: 0, y: 0, seconds: 31 },
      { displayID: "1", x: 0, y: 0, action: "click" },
      { x: 0, y: 0 },
    ]) {
      expect(await client.callTool({ name: "cursor", arguments: args })).toMatchObject({ isError: true })
    }
  } finally {
    await client.close()
    await use.server.close()
    use.close()
  }
})

// The stdio command is deliberately macOS-only; this checks CLI routing and a clean protocol stream without opening UI.
test.skipIf(process.platform !== "darwin")("source CLI serves Open Use over stdio from another project", async () => {
  await using root = await tmpdir("lychee-open-use-")
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--preload",
      fileURLToPath(import.meta.resolve("@opentui/solid/preload")),
      path.join(import.meta.dir, "../src/index.ts"),
      "open-use",
      "mcp",
    ],
    cwd: root.path,
    env: Object.fromEntries(
      Object.entries(isolatedEnv(root.path, { OPENCODE_DISABLE_FFF: "true" })).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    stderr: "pipe",
  })
  const client = new Client({ name: "open-use-cli-test", version: "1.0.0" })
  const errors: string[] = []
  transport.stderr?.on("data", (data) => errors.push(String(data)))
  try {
    await client.connect(transport)
    expect(client.getInstructions()).toContain("realInput is always false")
    expect(await client.listTools()).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "cursor" }),
        expect.objectContaining({ name: "guide" }),
      ]),
    })
  } catch (error) {
    throw new Error(`Open Use CLI handshake failed: ${errors.join("")}`, { cause: error })
  } finally {
    await client.close()
    await transport.close()
  }
})
