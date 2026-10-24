import { Schema } from "effect"
import { Global } from "@opencode/util/global"
import { mkdir, rename } from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"

const state = Schema.Struct({
  visible: Schema.Boolean,
  realInput: Schema.Literal(false),
  displayID: Schema.optional(Schema.String),
  x: Schema.optional(Schema.Number),
  y: Schema.optional(Schema.Number),
})
const reply = Schema.Struct({
  id: Schema.Number,
  ok: Schema.Boolean,
  error: Schema.optional(Schema.String),
  state: Schema.optional(state),
  displays: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        width: Schema.Number,
        height: Schema.Number,
        scale: Schema.Number,
      }),
    ),
  ),
})
const decode = Schema.decodeUnknownSync(Schema.fromJsonString(reply))

export async function cursorBinary() {
  if (process.platform !== "darwin") throw new Error("Open Use 目前仅支持 macOS。")
  const sourcePath = path.join(import.meta.dir, "cursor.swift")
  const source = Bun.file(sourcePath)
  if (!(await source.exists())) throw new Error("Open Use 原生源码缺失，请从 OpenCode-Lychee 源码仓库启动。")
  const hash = new Bun.CryptoHasher("sha256")
    .update(await source.arrayBuffer())
    .digest("hex")
    .slice(0, 16)
  const directory = path.join(Global.Path.cache, "open-use", `${hash}-${process.arch}`)
  const binary = path.join(directory, "OpenUse")
  if (await Bun.file(binary).exists()) return binary
  await mkdir(directory, { recursive: true })
  const temporary = path.join(directory, `OpenUse-${crypto.randomUUID()}`)
  const child = Bun.spawn(
    [
      "/usr/bin/swiftc",
      "-swift-version",
      "6",
      "-O",
      "-module-cache-path",
      path.join(directory, "modules"),
      sourcePath,
      "-o",
      temporary,
    ],
    { stdout: "ignore", stderr: "pipe", timeout: 120_000 },
  )
  const error = await new Response(child.stderr).text()
  if ((await child.exited) !== 0) throw new Error(`Open Use 编译失败，需要 Xcode Command Line Tools。\n${error}`)
  await rename(temporary, binary)
  return binary
}

export type CursorInput =
  | { action: "displays" | "state" | "hide" }
  | { action: "move"; displayID: string; x: number; y: number; seconds: number }

export class NativeCursor {
  private child?: ReturnType<typeof spawn>
  private starting?: Promise<void>
  private sequence = 0
  private closed = false
  private pending = new Map<number, { resolve: (value: typeof reply.Type) => void; reject: (error: Error) => void }>()

  private async start() {
    const binary = await cursorBinary()
    if (this.closed) throw new Error("Open Use 已停止。")
    const child = spawn(binary, [], { stdio: ["pipe", "pipe", "inherit"] })
    this.child = child
    if (!child.stdout) throw new Error("Open Use 无法读取光标状态。")
    const lines = createInterface({ input: child.stdout })
    lines.on("line", (line) => {
      try {
        const result = decode(line)
        const request = this.pending.get(result.id)
        this.pending.delete(result.id)
        if (!result.ok) request?.reject(new Error(result.error ?? "Open Use 操作失败。"))
        else request?.resolve(result)
      } catch {
        this.close()
      }
    })
    child.once("error", () => this.close())
    child.once("exit", () => {
      lines.close()
      this.close()
    })
  }

  async request(input: CursorInput) {
    if (this.closed) throw new Error("Open Use 已停止，请重新连接 MCP。")
    this.starting ??= this.start()
    await this.starting
    const id = ++this.sequence
    return new Promise<typeof reply.Type>((resolve, reject) => {
      const timer = setTimeout(() => this.close(), 15_000)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      this.child?.stdin?.write(JSON.stringify({ ...input, id }) + "\n", (error) => {
        if (error) this.close()
      })
    })
  }

  close() {
    this.closed = true
    this.child?.kill()
    for (const request of this.pending.values()) request.reject(new Error("Open Use 光标连接已关闭。"))
    this.pending.clear()
  }
}
