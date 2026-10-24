import { Effect, Option } from "effect"
import { Global } from "@opencode/util/global"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { cursorBinary, NativeCursor } from "../../open-use/native"
import { instructions, serveOpenUse } from "../../open-use/server"
import { selfCommand } from "../../util/process"

export default Runtime.handler(Commands.commands["open-use"], (input) =>
  Effect.promise(async (signal) => {
    if (input.action === "config") {
      process.stdout.write(
        JSON.stringify(
          {
            mcp: {
              servers: {
                open_use: {
                  type: "local",
                  command: [...selfCommand(), "open-use", "mcp"],
                  timeout: { execution: 150_000 },
                },
              },
            },
          },
          null,
          2,
        ) + "\n",
      )
      return
    }
    if (input.action === "guide") {
      process.stdout.write(instructions + "\n")
      return
    }
    if (input.action === "mcp") return serveOpenUse(signal)
    const binary = await cursorBinary()
    if (input.action === "preview") {
      const output = path.resolve(
        Option.getOrUndefined(input.output) ?? path.join(Global.Path.cache, "open-use", "cursor-preview.png"),
      )
      await mkdir(path.dirname(output), { recursive: true })
      const child = Bun.spawn([binary, "--preview", output], { stdout: "ignore", stderr: "inherit" })
      if ((await child.exited) !== 0) throw new Error("Open Use 光标预览生成失败。")
      process.stdout.write(output + "\n")
      return
    }
    const cursor = new NativeCursor()
    try {
      const result = await cursor.request({ action: "displays" })
      const display = result.displays?.[0]
      if (!display) throw new Error("没有可用的 macOS 显示器。")
      await cursor.request({
        action: "move",
        displayID: display.id,
        x: display.width / 2,
        y: display.height / 2,
        seconds: 8,
      })
      process.stdout.write("Open Use 模型光标已显示在屏幕中央；8 秒后关闭，不会移动真实鼠标。\n")
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer)
          signal.removeEventListener("abort", finish)
          resolve()
        }
        const timer = setTimeout(finish, 8_000)
        signal.addEventListener("abort", finish, { once: true })
        if (signal.aborted) finish()
      })
    } finally {
      cursor.close()
    }
  }),
)
