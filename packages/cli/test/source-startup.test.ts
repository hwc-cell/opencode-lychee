import { expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { isolatedEnv } from "./fixture/environment"

test("source CLI starts its server from a project without the CLI bunfig", async () => {
  await using root = await tmpdir("lychee-source-startup-")
  const child = Bun.spawn(
    [
      process.execPath,
      "--preload",
      fileURLToPath(import.meta.resolve("@opentui/solid/preload")),
      path.join(import.meta.dir, "../src/index.ts"),
      "api",
      "--standalone",
      "GET",
      "/api/info",
    ],
    {
      cwd: root.path,
      env: isolatedEnv(root.path, { OPENCODE_DISABLE_FFF: "true", OPENCODE_PRINT_LOGS: "1" }),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 20_000,
    },
  )
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect({ exitCode, stderr }).toMatchObject({ exitCode: 0 })
    expect(JSON.parse(stdout)).toMatchObject({ pid: expect.any(Number), version: expect.any(String) })
  } finally {
    if (child.exitCode === null) child.kill()
    await child.exited
  }
})
