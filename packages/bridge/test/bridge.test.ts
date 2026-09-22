import { afterEach, describe, expect, test } from "bun:test"
import { createCipheriv } from "node:crypto"
import { deliverMessage, enqueue, isQueued, type BotSdk } from "../src/bot"
import { handleChatCommand } from "../src/commands"
import { chunkText, loginUntilConfirmed, messageText, sendText, sendTyping } from "../src/weixin/client"
import { conversationKey, messageKey } from "../src/weixin/keys"
import { decodeMediaKey, messagePrompt } from "../src/weixin/media"

const fetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = fetch
})

describe("queue", () => {
  test("removes idle keys", async () => {
    let done = () => {}
    const wait = new Promise<void>((resolve) => {
      done = resolve
    })
    const run = enqueue("user", () => wait)
    expect(isQueued("user")).toBe(true)
    done()
    await run
    await Promise.resolve()
    expect(isQueued("user")).toBe(false)
  })

  test("reads the newest assistant messages", async () => {
    const orders: string[] = []
    const sdk = {
      v2: {
        model: { list: async () => [] },
        session: {
          create: async () => ({}),
          prompt: async () => ({}),
          switchModel: async () => ({}),
          wait: async () => ({}),
          interrupt: async () => ({}),
          messages: async (args: { order?: "asc" | "desc" }) => {
            orders.push(args.order ?? "")
            return { data: { data: [{ type: "assistant", content: [{ type: "text", text: "latest" }] }] } }
          },
        },
      },
    } as BotSdk
    const replies: string[] = []

    await deliverMessage({
      sdk,
      sessionID: "session",
      text: "hello",
      reply: async (text) => {
        replies.push(text)
      },
      log: () => {},
    })

    expect(orders.length).toBeGreaterThan(0)
    expect(orders.every((order) => order === "desc")).toBe(true)
    expect(replies).toContain("latest")
  })

  test("reconnects the wait call without submitting the prompt twice", async () => {
    let prompts = 0
    let waits = 0
    const sdk = {
      v2: {
        model: { list: async () => [] },
        session: {
          create: async () => ({}),
          prompt: async () => {
            prompts++
            return {}
          },
          switchModel: async () => ({}),
          wait: async () => {
            waits++
            if (waits === 1) throw new Error("connection lost")
            return {}
          },
          interrupt: async () => ({}),
          messages: async () => ({
            data: { data: [{ type: "assistant", content: [{ type: "text", text: "done" }] }] },
          }),
        },
      },
    } as BotSdk

    await deliverMessage({ sdk, sessionID: "session", text: "hello", reply: async () => {}, log: () => {} })
    expect(prompts).toBe(1)
    expect(waits).toBe(2)
  })

  test("reuses the prompt id when admission has an ambiguous transport failure", async () => {
    const ids: string[] = []
    const sdk = {
      v2: {
        model: { list: async () => [] },
        session: {
          create: async () => ({}),
          prompt: async (input: { id?: string }) => {
            ids.push(input.id ?? "")
            if (ids.length === 1) throw new Error("response lost")
            return {}
          },
          switchModel: async () => ({}),
          wait: async () => ({}),
          interrupt: async () => ({}),
          messages: async () => ({
            data: { data: [{ type: "assistant", content: [{ type: "text", text: "done" }] }] },
          }),
        },
      },
    } as BotSdk

    await deliverMessage({
      sdk,
      sessionID: "session",
      text: "hello",
      promptID: "msg_stable",
      reply: async () => {},
      log: () => {},
    })
    expect(ids).toEqual(["msg_stable", "msg_stable"])
  })

  test("forwards media attachments with the durable prompt", async () => {
    let prompt: { text: string; files?: Array<{ uri: string; mime: string; name?: string }> } | undefined
    const sdk = {
      v2: {
        model: { list: async () => [] },
        session: {
          create: async () => ({}),
          prompt: async (input: { prompt?: typeof prompt }) => {
            prompt = input.prompt
            return {}
          },
          switchModel: async () => ({}),
          wait: async () => ({}),
          interrupt: async () => ({}),
          messages: async () => ({
            data: { data: [{ type: "assistant", content: [{ type: "text", text: "done" }] }] },
          }),
        },
      },
    } as BotSdk
    const files = [{ uri: "data:image/png;base64,aGVsbG8=", mime: "image/png", name: "photo.png" }]

    await deliverMessage({ sdk, sessionID: "session", text: "inspect", files, reply: async () => {}, log: () => {} })

    expect(prompt).toEqual({ text: "inspect", files })
  })
})

describe("weixin client", () => {
  test("does not split surrogate pairs", () => {
    expect(chunkText("a😀b", 2)).toEqual(["a", "😀", "b"])
  })

  test("stops after four expired QR codes", async () => {
    let id = 0
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes("get_bot_qrcode")) {
        id += 1
        return Response.json({ qrcode: `qr-${id}`, qrcode_img_content: `https://example.com/${id}` })
      }
      return Response.json({ status: "expired" })
    }) as typeof globalThis.fetch

    await expect(loginUntilConfirmed({})).rejects.toThrow("二维码连续过期")
    expect(id).toBe(4)
  })

  test("waits until the QR code has rendered before polling", async () => {
    const order: string[] = []
    globalThis.fetch = (async (input) => {
      if (String(input).includes("get_bot_qrcode")) {
        return Response.json({ qrcode: "qr", qrcode_img_content: "https://example.com/qr" })
      }
      order.push("poll")
      return Response.json({
        status: "confirmed",
        bot_token: "token",
        ilink_bot_id: "bot",
        ilink_user_id: "user",
      })
    }) as typeof globalThis.fetch

    await loginUntilConfirmed({
      onQr: async () => {
        order.push("render-start")
        await Promise.resolve()
        order.push("render-end")
      },
    })

    expect(order).toEqual(["render-start", "render-end", "poll"])
  })

  test("combines text items and voice transcripts in message order", () => {
    expect(
      messageText({
        item_list: [
          { type: 1, text_item: { text: "one" } },
          { type: 3, voice_item: { text: "voice" } },
          { type: 1, text_item: { text: "two" } },
        ],
      }),
    ).toBe("one\nvoice\ntwo")
    expect(messageText({ item_list: [{ type: 2, image_item: {} }] })).toBeUndefined()
  })

  test("decodes both iLink AES key formats and decrypts image media", async () => {
    const key = Buffer.from("00112233445566778899aabbccddeeff", "hex")
    const plaintext = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("image"),
    ])
    const cipher = createCipheriv("aes-128-ecb", key, null)
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    globalThis.fetch = (async () => new Response(encrypted)) as typeof globalThis.fetch

    expect(decodeMediaKey(key.toString("base64"))).toEqual(key)
    expect(decodeMediaKey(Buffer.from(key.toString("hex")).toString("base64"))).toEqual(key)

    const prompt = await messagePrompt({
      item_list: [
        {
          type: 2,
          image_item: {
            media: { encrypt_query_param: "query", aes_key: key.toString("base64") },
          },
        },
      ],
    })

    expect(prompt.text).toContain("微信图片")
    expect(prompt.files).toEqual([
      {
        uri: `data:image/png;base64,${plaintext.toString("base64")}`,
        mime: "image/png",
        name: "wechat-image-1.jpg",
      },
    ])
  })

  test("rejects untrusted media URLs", async () => {
    await expect(
      messagePrompt({
        item_list: [{ type: 4, file_item: { file_name: "secret.txt", url: "https://example.com/secret.txt" } }],
      }),
    ).rejects.toThrow("不受信任")
  })

  test("uses WeChat voice transcripts without downloading the audio", async () => {
    let fetched = false
    globalThis.fetch = (async () => {
      fetched = true
      return new Response()
    }) as typeof globalThis.fetch

    await expect(
      messagePrompt({
        item_list: [
          {
            type: 3,
            voice_item: { text: "明天下午三点开会", media: { encrypt_query_param: "unused" } },
          },
        ],
      }),
    ).resolves.toEqual({ text: "明天下午三点开会", files: [] })
    expect(fetched).toBe(false)
  })

  test("rejects media announced above the default size limit", async () => {
    globalThis.fetch = (async () =>
      new Response("too large", { headers: { "content-length": String(11 * 1024 * 1024) } })) as typeof globalThis.fetch

    await expect(
      messagePrompt({
        item_list: [{ type: 4, file_item: { file_name: "large.pdf", media: { encrypt_query_param: "query" } } }],
      }),
    ).rejects.toThrow("10MB")
  })

  test("does not forward encrypted media without a key", async () => {
    globalThis.fetch = (async () => new Response("ciphertext")) as typeof globalThis.fetch

    await expect(
      messagePrompt({
        item_list: [
          {
            type: 2,
            image_item: { media: { encrypt_query_param: "query", encrypt_type: 1 } },
          },
        ],
      }),
    ).rejects.toThrow("缺少解密密钥")
  })

  test("rejects a malformed send response instead of reporting false success", async () => {
    globalThis.fetch = (async () => new Response("not-json", { status: 200 })) as typeof globalThis.fetch
    await expect(
      sendText({ token: "token", baseUrl: "https://example.com", toUserId: "user", contextToken: "ctx", text: "hi" }),
    ).rejects.toThrow("无效响应")
  })

  test("ignores malformed typing responses because typing is best effort", async () => {
    globalThis.fetch = (async () => new Response("not-json", { status: 200 })) as typeof globalThis.fetch
    await expect(
      sendTyping({ token: "token", baseUrl: "https://example.com", userId: "user", contextToken: "ctx", status: 1 }),
    ).resolves.toBeUndefined()
  })

  test("isolates group conversations and generates stable message keys", () => {
    const direct = { from_user_id: "user", message_id: 42 }
    const groupA = { ...direct, group_id: "group-a" }
    const groupB = { ...direct, group_id: "group-b" }
    expect(conversationKey("bot", direct)).toBe("bot#user")
    expect(conversationKey("bot", groupA)).not.toBe(conversationKey("bot", groupB))
    expect(messageKey("bot", groupA)).toBe(messageKey("bot", groupA))
  })
})

describe("chat commands", () => {
  test("matches a provider/model id and supports help", async () => {
    let model = ""
    const args = {
      channel: "weixin",
      fromUserId: "owner",
      ownerUserId: "owner",
      workDir: "/tmp",
      reply: async () => {},
      log: () => {},
      models: {
        list: async () => [{ id: "model", providerID: "provider", name: "Display Name" }],
        switchModel: async (next: { id: string; providerID: string }) => {
          model = `${next.providerID}/${next.id}`
          return true
        },
      },
    }

    expect(await handleChatCommand({ ...args, text: "/model provider/model" })).toBe(true)
    expect(model).toBe("provider/model")
    expect(await handleChatCommand({ ...args, text: "/help" })).toBe(true)
  })

  test("handles session controls and preserves directory casing", async () => {
    const replies: string[] = []
    const calls: string[] = []
    const args = {
      channel: "weixin",
      fromUserId: "owner",
      ownerUserId: "owner",
      workDir: "/work",
      reply: async (text: string) => {
        replies.push(text)
      },
      log: () => {},
      controls: {
        newSession: async () => {
          calls.push("new")
          return true
        },
        clearSession: async () => {
          calls.push("clear")
          return true
        },
        stop: async () => {
          calls.push("stop")
          return true
        },
        status: async () => ({
          directory: "/Work/MyProject",
          model: { id: "model", providerID: "provider", variant: "max" },
          sessionID: "session",
          running: true,
        }),
        directory: async (next?: string) => {
          calls.push(`where:${next ?? ""}`)
          return { ok: true, directory: next ?? "/Work/MyProject", changed: Boolean(next) }
        },
      },
    }

    expect(await handleChatCommand({ ...args, text: "/new" })).toBe(true)
    expect(await handleChatCommand({ ...args, text: "/stop" })).toBe(true)
    expect(await handleChatCommand({ ...args, text: "/status" })).toBe(true)
    expect(await handleChatCommand({ ...args, text: "/where /Work/MyProject" })).toBe(true)
    expect(await handleChatCommand({ ...args, text: "/clear" })).toBe(true)
    expect(calls).toEqual(["new", "stop", "where:/Work/MyProject", "clear"])
    expect(replies.some((reply) => reply.includes("provider/model (max)"))).toBe(true)

    expect(await handleChatCommand({ ...args, fromUserId: "guest", text: "/where /Secret" })).toBe(true)
    expect(calls).toEqual(["new", "stop", "where:/Work/MyProject", "clear"])
    expect(replies.at(-1)).toContain("只有扫码登录的账号")
  })
})
