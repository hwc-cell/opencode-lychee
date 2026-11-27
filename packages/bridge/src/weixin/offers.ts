import { createHash, randomBytes } from "node:crypto"
import { constants, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { open, realpath } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { readState, type WeixinCredential } from "./state"

const lifetime = 5 * 60_000
const tokenPattern = /^[A-Za-z0-9_-]{16}$/
const directory = () => path.join(homedir(), ".local", "state", "opencode", "weixin-offers")
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
const offerPath = (code: string) => path.join(directory(), digest(code) + ".json")

type Offer =
  | { kind: "session"; id: string; directory: string }
  | { kind: "file"; path: string; name: string; digest: string }

export const MAX_WEIXIN_FILE_BYTES = 10 * 1024 * 1024

export async function readWeixinFile(filename: string) {
  const file = await open(filename, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size <= 0 || info.size > MAX_WEIXIN_FILE_BYTES)
      throw new Error("仅支持非空普通文件，最大 10 MB。")
    // Read at most one byte past the observed length even if the file grows.
    const bytes = Buffer.alloc(info.size + 1)
    let length = 0
    while (length < bytes.length) {
      const result = await file.read(bytes, length, bytes.length - length, null)
      if (!result.bytesRead) break
      length += result.bytesRead
    }
    if (length !== info.size) throw new Error("文件大小已改变，请重新选择。")
    return bytes.subarray(0, length)
  } finally {
    await file.close()
  }
}

function issue(offer: Offer) {
  const credential = readState().credential
  if (!credential) throw new Error("请先运行 OpenCode-Lychee weixin login。")
  const root = directory()
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const now = Date.now()
  for (const name of readdirSync(root)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
    const filename = path.join(root, name)
    try {
      if (statSync(filename).mtimeMs < now - lifetime) unlinkSync(filename)
    } catch {}
  }
  const code = randomBytes(12).toString("base64url")
  const record = { offer, account: credential.accountId, owner: credential.userId, expires: now + lifetime }
  writeFileSync(offerPath(code), JSON.stringify(record), { mode: 0o600, flag: "wx" })
  return code
}

export function offerWeixinSession(input: { id: string; directory: string }) {
  return issue({ kind: "session", id: input.id, directory: input.directory })
}

export async function offerWeixinFile(filename: string) {
  const file = await realpath(filename)
  const bytes = await readWeixinFile(file)
  return issue({
    kind: "file",
    path: file,
    name: path.basename(file).replace(/[\u0000-\u001f\u007f]/g, "_"),
    digest: digest(bytes),
  })
}

export function consumeWeixinOffer<Kind extends Offer["kind"]>(
  kind: Kind,
  code: string,
  credential: Pick<WeixinCredential, "userId" | "accountId">,
): Extract<Offer, { kind: Kind }> | undefined {
  if (!tokenPattern.test(code)) return
  const filename = offerPath(code)
  try {
    const data = JSON.parse(readFileSync(filename, "utf8")) as {
      offer: Offer
      account: string
      owner: string
      expires: number
    }
    if (data.account !== credential.accountId || data.owner !== credential.userId || data.offer.kind !== kind) return
    // Unlink is atomic. Only one process can consume the same code.
    unlinkSync(filename)
    if (data.expires <= Date.now()) return
    return data.offer as Extract<Offer, { kind: Kind }>
  } catch {
    return
  }
}

export async function readOfferedFile(offer: Extract<Offer, { kind: "file" }>) {
  const bytes = await readWeixinFile(offer.path)
  if (digest(bytes) !== offer.digest) throw new Error("文件内容已改变，请在电脑重新选择。")
  return bytes
}
