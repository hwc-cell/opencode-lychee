import { expect, test } from "bun:test"
import { createDecipheriv, createHash } from "node:crypto"
import { sendWeixinFile } from "../src/weixin/client"

const target = {
  token: "fixture",
  baseUrl: "https://ilinkai.weixin.qq.com",
  toUserId: "fixture-owner",
  contextToken: "fixture-dm",
  name: "报告.md",
  bytes: new TextEncoder().encode("实际选定的文件"),
}

test("uploads AES-encrypted bytes and sends their file reference to the same conversation", async () => {
  const requests: Request[] = []
  await sendWeixinFile(target, async (input, init) => {
    const request = new Request(input, init)
    requests.push(request)
    if (request.url.endsWith("/getuploadurl")) return Response.json({ upload_param: "fixture param&" })
    if (new URL(request.url).hostname === "novac2c.cdn.weixin.qq.com")
      return new Response("", { headers: { "x-encrypted-param": "fixture-download" } })
    return Response.json({ ret: 0 })
  })
  expect(requests).toHaveLength(3)
  const slot = (await requests[0].json()) as {
    media_type: number
    aeskey: string
    rawfilemd5: string
    filekey: string
    filesize: number
  }
  expect(slot.media_type).toBe(3)
  expect(slot.rawfilemd5).toBe(createHash("md5").update(target.bytes).digest("hex"))
  const upload = new URL(requests[1].url)
  expect(upload.searchParams.get("encrypted_query_param")).toBe("fixture param&")
  expect(upload.searchParams.get("filekey")).toBe(slot.filekey)
  expect(requests[1].headers.get("authorization")).toBeNull()
  expect(requests[1].redirect).toBe("error")
  const encrypted = Buffer.from(await requests[1].arrayBuffer())
  expect(encrypted.length).toBe(slot.filesize)
  const decipher = createDecipheriv("aes-128-ecb", Buffer.from(slot.aeskey, "hex"), null)
  expect(new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]))).toEqual(target.bytes)
  const final = (await requests[2].json()) as { msg: unknown }
  expect(final.msg).toMatchObject({
    to_user_id: target.toUserId,
    context_token: target.contextToken,
    item_list: [
      {
        type: 4,
        file_item: {
          file_name: target.name,
          len: String(target.bytes.length),
          media: {
            encrypt_query_param: "fixture-download",
            aes_key: Buffer.from(slot.aeskey).toString("base64"),
            encrypt_type: 1,
          },
        },
      },
    ],
  })
})

test("rejects an upload URL outside WeChat's HTTPS CDN before sending any file bytes", async () => {
  const requests: string[] = []
  await expect(
    sendWeixinFile(target, async (input) => {
      requests.push(String(input))
      return Response.json({ upload_full_url: "https://cdn.weixin.qq.com.example/private" })
    }),
  ).rejects.toThrow("上传地址不可用")
  expect(requests).toEqual([`${target.baseUrl}/ilink/bot/getuploadurl`])
})
