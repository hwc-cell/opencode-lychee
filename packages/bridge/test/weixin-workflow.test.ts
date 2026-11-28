import { expect, test } from "bun:test"
import { watch, readFileSync } from "node:fs"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { messageKey, promptID } from "../src/weixin/keys"
import type { WeixinMessage } from "../src/weixin/client"
import type { WeixinState } from "../src/weixin/state"

test("real bridge keeps chats isolated and delivers questions, queue cancellation, and receipts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lychee-weixin-workflow-"))
  const first = path.join(root, "project-one")
  const second = path.join(root, "project-two")
  const stateDir = path.join(root, ".local", "state", "opencode")
  const stateFile = path.join(stateDir, "weixin.json")
  await Promise.all([mkdir(first), mkdir(second), mkdir(stateDir, { recursive: true })])
  const account = "fixture-bot"
  const keyA = `${account}#group:group-a`
  const keyB = `${account}#group:group-b`
  const keyOwner = `${account}#owner`
  const outgoing: Array<{ context: string; text: string }> = []
  const prompts: Array<{ sessionID: string; id: string; text: string }> = []
  const modelSwitches: string[] = []
  const requests: string[] = []
  const answered: unknown[] = []
  const updates: WeixinMessage[][] = []
  const listeners = new Set<() => void>()
  const waiting = new Map<string, Array<(response: Response) => void>>()
  const completed = new Set<string>()
  let pendingPoll: ((response: Response) => void) | undefined
  let cursor = 0
  let sequence = 0
  let questionPending = false
  let uploadSlots = 0
  let summaries = 0
  let exitCode: number | undefined
  let errors = ""
  const wake = () => {
    for (const listener of [...listeners]) listener()
  }
  const state = () => JSON.parse(readFileSync(stateFile, "utf8")) as WeixinState
  const updateResponse = (messages: WeixinMessage[]) =>
    Response.json({ ret: 0, msgs: messages, get_updates_buf: String(++cursor) })
  const complete = (sessionID: string) => {
    completed.add(sessionID)
    for (const resolve of waiting.get(sessionID) ?? []) resolve(new Response(null, { status: 204 }))
    waiting.delete(sessionID)
    wake()
  }
  const form = {
    id: "frm_workflow",
    sessionID: "ses_owner",
    title: "Questions",
    metadata: { kind: "question" },
    fields: [
      {
        key: "q0",
        type: "string",
        custom: true,
        description: "选择测试方向",
        options: [
          { value: "A", label: "A" },
          { value: "B", label: "B" },
        ],
      },
    ],
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url)
      requests.push(`${request.method} ${url.pathname}`)
      if (url.pathname.endsWith("/getupdates")) {
        wake()
        if (updates.length) return updateResponse(updates.shift()!)
        return new Promise<Response>((resolve) => {
          pendingPoll = resolve
          wake()
        })
      }
      if (url.pathname.endsWith("/sendmessage")) {
        const body = (await request.json()) as {
          msg: { context_token: string; item_list: Array<{ text_item: { text: string } }> }
        }
        outgoing.push({
          context: body.msg.context_token,
          text: body.msg.item_list.map((item) => item.text_item.text).join("\n"),
        })
        wake()
        return Response.json({ ret: 0 })
      }
      if (url.pathname.endsWith("/getconfig")) return Response.json({ typing_ticket: "fixture" })
      if (url.pathname.endsWith("/sendtyping")) return Response.json({ ret: 0 })
      if (url.pathname.endsWith("/getuploadurl")) {
        uploadSlots++
        return Response.json({ upload_full_url: "https://invalid.example/upload" })
      }
      if (url.pathname.endsWith("/generate/text")) {
        const body = (await request.json()) as { prompt: string }
        if (!body.prompt.includes("电脑版会话上下文"))
          return Response.json({ error: "Missing source transcript" }, { status: 400 })
        summaries++
        return Response.json({ data: { text: "## 已完成\n生成测试阶段小结" } })
      }
      const sessionID = url.pathname.match(/\/session\/([^/]+)/)?.[1]
      if (request.method === "GET" && url.pathname === `/api/session/${sessionID}`) {
        const directory = sessionID === "ses_desktop" ? second : first
        return Response.json({
          data: {
            id: sessionID,
            title: sessionID === "ses_desktop" ? "电脑版测试会话" : "微信原会话",
            model: { id: "desktop-model", providerID: "fixture" },
            location: { directory },
            time: { updated: Date.UTC(2026, 10, 27) },
          },
        })
      }
      if (url.pathname.endsWith("/permission")) return Response.json({ data: [] })
      if (url.pathname.endsWith("/form"))
        return Response.json({ data: questionPending && sessionID === "ses_owner" ? [form] : [] })
      if (url.pathname.endsWith("/form/frm_workflow"))
        return Response.json({ data: { ...form, state: { status: questionPending ? "pending" : "answered" } } })
      if (url.pathname.endsWith("/form/frm_workflow/reply")) {
        answered.push(await request.json())
        questionPending = false
        complete("ses_owner")
        return new Response(null, { status: 204 })
      }
      if (url.pathname.endsWith("/model")) {
        modelSwitches.push(sessionID!)
        return new Response(null, { status: 204 })
      }
      if (url.pathname.endsWith("/prompt")) {
        const body = (await request.json()) as { id: string; text: string }
        prompts.push({ sessionID: sessionID!, ...body })
        if (body.text === "需要追问") questionPending = true
        wake()
        return Response.json({ data: { id: body.id } })
      }
      if (url.pathname.endsWith("/wait")) {
        if (completed.has(sessionID!)) return new Response(null, { status: 204 })
        return new Promise<Response>((resolve) => {
          waiting.set(sessionID!, [...(waiting.get(sessionID!) ?? []), resolve])
        })
      }
      if (url.pathname.endsWith("/interrupt")) {
        complete(sessionID!)
        return Response.json({})
      }
      if (url.pathname.endsWith("/message")) {
        const prompt = prompts.findLast((prompt) => prompt.sessionID === sessionID)
        return Response.json({
          data: prompt
            ? [
                ...(completed.has(sessionID!)
                  ? [
                      {
                        id: `msg_reply_${prompt.id}`,
                        type: "assistant",
                        content: [{ type: "text", text: `完成：${prompt.text}` }],
                      },
                    ]
                  : []),
                { id: prompt.id, type: "user", text: prompt.text },
              ]
            : sessionID === "ses_desktop"
              ? [{ id: "msg_desktop", type: "user", text: "电脑版会话上下文" }]
              : [],
          cursor: {},
        })
      }
      return new Response(`Unexpected fixture request: ${request.method} ${url.pathname}`, { status: 500 })
    },
  })
  await writeFile(path.join(second, "report.md"), "用户在电脑确认的文件")
  await writeFile(
    stateFile,
    JSON.stringify({
      credential: {
        token: "fixture-only",
        baseUrl: server.url.origin,
        accountId: account,
        userId: "owner",
        savedAt: new Date().toISOString(),
      },
      workDir: first,
      model: { id: "fixture", providerID: "fixture" },
      sessions: { [keyA]: "ses_a", [keyB]: "ses_b", [keyOwner]: "ses_owner" },
    } satisfies WeixinState),
  )
  const watcher = watch(stateDir, wake)
  const child = Bun.spawn([process.execPath, fileURLToPath(new URL("./fixture/weixin-runner.ts", import.meta.url))], {
    cwd: path.dirname(fileURLToPath(import.meta.url)),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
      XDG_STATE_HOME: path.join(root, "state"),
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      TMPDIR: root,
      TEMP: root,
      TMP: root,
      OPENCODE_LANG: "zh",
      LYCHEE_FIXTURE_SERVER: server.url.origin,
      LYCHEE_FIXTURE_DIRECTORY: first,
      LYCHEE_FIXTURE_ARTIFACTS: second,
      LYCHEE_MODEL_TIMEOUT_MS: "15000",
    },
  })
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text().then((text) => {
    errors = text
    return text
  })
  void child.exited.then((code) => {
    exitCode = code
    wake()
  })
  const until = (predicate: () => boolean, label: string) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(check)
        clearInterval(poll)
        reject(
          new Error(
            `Timed out: ${label}; requests=${requests.slice(-15).join(",")}; replies=${outgoing
              .slice(-5)
              .map((item) => item.text)
              .join(" | ")}; stderr=${errors}`,
          ),
        )
      }, 5000)
      const check = () => {
        if (exitCode !== undefined) {
          clearTimeout(timer)
          clearInterval(poll)
          listeners.delete(check)
          reject(new Error(`Bridge exited ${exitCode}: ${errors}`))
          return
        }
        if (!predicate()) return
        clearTimeout(timer)
        clearInterval(poll)
        listeners.delete(check)
        resolve()
      }
      const poll = setInterval(check, 25)
      listeners.add(check)
      check()
    })
  const inject = (text: string, group?: string) => {
    const message: WeixinMessage = {
      seq: ++sequence,
      from_user_id: "owner",
      group_id: group,
      context_token: `context-${group ?? "owner"}`,
      message_type: 1,
      item_list: [{ type: 1, text_item: { text } }],
    }
    if (pendingPoll) {
      const resolve = pendingPoll
      pendingPoll = undefined
      resolve(updateResponse([message]))
    } else updates.push([message])
    return message
  }
  const reply = (group: string, text: string) =>
    outgoing.some((message) => message.context === `context-${group}` && message.text.includes(text))
  try {
    await until(() => Boolean(pendingPoll), "first getupdates")
    inject(`/where ${second}`, "group-a")
    await until(() => reply("group-a", second), "switch group-a project")
    expect(state().sessions?.[keyA]).toBeUndefined()
    expect(state().sessions?.[keyB]).toBe("ses_b")
    expect(state().workDir).toBe(first)
    inject("/status", "group-b")
    await until(() => reply("group-b", first), "group-b keeps its directory")
    inject("/projects", "group-a")
    await until(() => reply("group-a", `1. ${first}`), "project list")
    inject("/projects 1", "group-a")
    await until(() => state().sessions?.[keyA] === "ses_a", "restore original session")
    inject("/sessions ses_b", "group-a")
    await until(() => reply("group-a", "只能切换"), "reject foreign session")
    expect(state().sessions?.[keyA]).toBe("ses_a")

    inject("任务甲", "group-a")
    await until(() => prompts.some((prompt) => prompt.text === "任务甲"), "group-a active prompt")
    inject("任务乙", "group-b")
    await until(() => prompts.some((prompt) => prompt.text === "任务乙"), "group-b active prompt")
    const cancelled = inject("不要执行甲2", "group-a")
    await until(() => reply("group-a", "已排队"), "group-a queued message")
    inject("保留乙2", "group-b")
    await until(() => reply("group-b", "已排队"), "group-b queued message")
    inject("/queue", "group-a")
    await until(
      () => outgoing.some((message) => message.context === "context-group-a" && message.text.includes("不要执行甲2")),
      "queue listing",
    )
    const listing = outgoing.findLast(
      (message) => message.context === "context-group-a" && message.text.includes("不要执行甲2"),
    )!.text
    expect(listing).toContain("任务甲")
    expect(listing).not.toContain("任务乙")
    expect(listing).not.toContain("保留乙2")
    const cancelledID = promptID(account, cancelled).slice(4, 16)
    expect(listing).toContain(cancelledID)
    inject(`/queue cancel ${cancelledID}`, "group-a")
    await until(() => reply("group-a", "已取消这条"), "cancel one waiting message")
    await until(() => !state().inbox?.[messageKey(account, cancelled)], "cancelled inbox entry removed immediately")
    complete("ses_a")
    complete("ses_b")
    await until(() => reply("group-a", "任务回执"), "completion receipt")
    await until(() => prompts.some((prompt) => prompt.text === "保留乙2"), "other chat's queue is preserved")
    expect(prompts.some((prompt) => prompt.text === "不要执行甲2")).toBe(false)

    const ownerTask = inject("需要追问")
    await until(() => reply("owner", "frm_workflow"), "question notification through polling")
    inject("/answer frm_workflow 2")
    await until(() => answered.length === 1, "question submitted through chat")
    expect(answered).toEqual([{ answer: { q0: "B" } }])
    await until(() => reply("owner", "答案已提交") && reply("owner", "任务回执"), "question continuation and receipt")
    await until(() => !state().inbox?.[messageKey(account, ownerTask)], "owner task finishes before switching sessions")

    const codes = JSON.parse(readFileSync(path.join(second, "offer-codes.json"), "utf8")) as {
      code: string
      file: string
    }
    inject(`/takeover ${codes.code}`, "group-a")
    await until(() => reply("group-a", "仅限扫码账号私聊"), "group cannot redeem a session")
    inject(`/takeover ${codes.code}`)
    await until(() => reply("owner", "已接入「电脑版测试会话」"), "owner connects desktop session")
    expect(state().sessions?.[keyOwner]).toBe("ses_desktop")
    expect(state().conversations?.[keyOwner]?.directory).toBe(second)
    inject(`/takeover ${codes.code}`)
    await until(() => reply("owner", "已过期或已使用"), "session code is single-use")
    inject("/sessions")
    await until(() => reply("owner", "1. 电脑版测试会话 · ses_desktop"), "session list includes title and number")
    const selected = inject("/sessions 1")
    await until(
      () => !state().inbox?.[messageKey(account, selected)] && reply("owner", "已切换会话"),
      "owner selects displayed number",
    )
    inject("/summary now")
    await until(() => reply("owner", "生成测试阶段小结"), "summary generated from desktop transcript")
    const report = path.join(second, ".opencode", "reports", "ses_desktop-stage.md")
    expect(readFileSync(report, "utf8")).toContain("生成测试阶段小结")
    const summariesBefore = outgoing.filter((message) => message.text.includes("生成测试阶段小结")).length
    inject("/summary")
    await until(
      () => outgoing.filter((message) => message.text.includes("生成测试阶段小结")).length > summariesBefore,
      "summary read from disk",
    )
    expect(summaries).toBe(1)
    await writeFile(path.join(second, "report.md"), "文件在确认之后被改动")
    inject(`/file ${codes.file}`)
    await until(() => reply("owner", "选定的文件已变更"), "changed attachment not sent")
    expect(uploadSlots).toBe(0)

    inject("在手机上继续")
    await until(
      () => prompts.some((prompt) => prompt.sessionID === "ses_desktop" && prompt.text === "在手机上继续"),
      "prompt reaches the same desktop session",
    )
    expect(modelSwitches).not.toContain("ses_desktop")
    complete("ses_desktop")
  } finally {
    for (const sessionID of waiting.keys()) complete(sessionID)
    pendingPoll?.(updateResponse([]))
    child.kill()
    let forced = false
    const deadline = setTimeout(() => {
      forced = true
      child.kill("SIGKILL")
    }, 2000)
    const code = await child.exited
    clearTimeout(deadline)
    await Promise.all([stdout, stderr])
    watcher.close()
    server.stop(true)
    await rm(root, { recursive: true, force: true })
    expect(forced).toBe(false)
    // Windows SIGTERM terminates the process instead of running its signal handler.
    if (process.platform !== "win32") expect(code).toBe(0)
  }
}, 20000)
