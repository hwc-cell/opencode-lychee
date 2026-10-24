import { Client, InMemoryTransport } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { isolatedEnv } from "./fixture/environment"
import { createOpenUseServer } from "../src/open-use/server"
import { prepareOpenUse } from "../src/open-use/host"

test("Open Use teaches exact-window input boundaries and rejects unapproved or invalid requests before opening UI", async () => {
  const use = createOpenUseServer()
  const client = new Client({ name: "open-use-test", version: "1.0.0" })
  const [local, remote] = InMemoryTransport.createLinkedPair()
  try {
    await Promise.all([use.server.connect(remote), client.connect(local)])
    expect(client.getInstructions()).toContain("Real click/type_text actions are OFF")
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "click",
      "cursor",
      "displays",
      "guide",
      "hide",
      "observe_window",
      "permissions",
      "release_window",
      "select_window",
      "state",
      "type_text",
      "window_cursor",
      "windows",
    ])
    const guide = await client.callTool({ name: "guide", arguments: {} })
    const guideText = JSON.stringify(guide)
    expect(guideText).toContain("origin TOP LEFT")
    expect(guideText).toContain("Never describe a cursor move as a real click")
    expect(guideText).toContain("SAME windowID")
    expect(guideText).toContain("never fall back to another window")
    expect(guideText).toContain("Each real action also needs a local native human confirmation")
    for (const args of [
      { displayID: "1", x: -1, y: 0 },
      { displayID: "1", x: 0, y: 0, seconds: 31 },
      { displayID: "1", x: 0, y: 0, action: "click" },
      { x: 0, y: 0 },
    ]) {
      expect(await client.callTool({ name: "cursor", arguments: args })).toMatchObject({ isError: true })
    }
    for (const args of [{ windowID: 0 }, { windowID: 1.5 }, { windowID: 4294967296 }]) {
      expect(await client.callTool({ name: "select_window", arguments: args })).toMatchObject({ isError: true })
    }
    expect(await client.callTool({ name: "window_cursor", arguments: { windowID: 1, x: -1, y: 0 } })).toMatchObject({
      isError: true,
    })
    for (const name of ["click", "type_text"]) {
      const denied = await client.callTool({
        name,
        arguments: {
          windowID: 1,
          observationID: "not-an-observation",
          elementID: 0,
          ...(name === "type_text" ? { text: "test" } : {}),
        },
      })
      expect(denied.isError).toBe(true)
      expect(JSON.stringify(denied)).toContain("Real input is disabled")
    }
    expect(
      await client.callTool({
        name: "click",
        arguments: {
          windowID: 1,
          observationID: "test",
          elementID: 0,
          allowInput: true,
        },
      }),
    ).toMatchObject({ isError: true })
  } finally {
    await client.close()
    await use.server.close()
    use.close()
  }
})

// The local TUI host is macOS-only. Listing tools and reading the guide must not start native UI.
test.skipIf(process.platform !== "darwin")(
  "local TUI host carries model instructions and revokes old handlers on close",
  async () => {
    const bridge = await prepareOpenUse()
    try {
      expect(bridge.instructions).toContain("window-bound")
      const guide = bridge.tools.find((tool) => tool.name === "guide")
      if (!guide) throw new Error("Open Use guide missing")
      expect(JSON.stringify(await guide.handler({}, { sessionID: "ses_local" }))).toContain("origin TOP LEFT")
      await bridge.close()
      const denied = await guide.handler({}, { sessionID: "ses_local" })
      expect(denied.isError).toBe(true)
      expect(JSON.stringify(denied)).toContain("disabled")
    } finally {
      await bridge.close()
    }
  },
)

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
