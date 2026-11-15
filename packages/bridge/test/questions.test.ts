import { describe, expect, test } from "bun:test"
import { OpenCode, type FormInfo } from "@opencode/client"
import { handleQuestionCommand, notifyQuestions } from "../src/questions"

function question(overrides: Partial<FormInfo> = {}): FormInfo {
  return {
    id: "frm_test",
    sessionID: "ses_test",
    title: "Questions",
    metadata: { kind: "question", tool: { messageID: "msg_test", id: "call_test" } },
    fields: [
      {
        key: "q0",
        type: "string",
        custom: true,
        description: "选个项目",
        options: [
          { value: "荔枝", label: "荔枝" },
          { value: "账本", label: "账本" },
        ],
      },
    ],
    ...overrides,
  }
}

function fixture(forms: FormInfo[] = [question()], state = "pending") {
  const changes: { method: string; path: string; body?: unknown }[] = []
  const requests: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url)
      requests.push(url.pathname)
      if (request.method !== "GET") {
        changes.push({
          method: request.method,
          path: url.pathname,
          ...(request.method === "POST" ? { body: await request.json() } : {}),
        })
        return new Response(null, { status: 204 })
      }
      if (url.pathname.endsWith("/form")) return Response.json({ data: forms })
      const form = forms.find((form) => form.id === url.pathname.split("/").at(-1))
      return Response.json({ data: { ...form, state: { status: state } } })
    },
  })
  const client = OpenCode.make({ baseUrl: server.url.origin })
  const replies: string[] = []
  return {
    server,
    changes,
    requests,
    replies,
    args: {
      client,
      sessionID: "ses_test",
      owner: true,
      reply: async (text: string) => {
        replies.push(text)
      },
    },
  }
}

describe("questions over chat", () => {
  test("announces question forms once, after a successful notification", async () => {
    const f = fixture([
      question(),
      question({ id: "frm_oauth", metadata: { kind: "oauth" } }),
      question({ id: "frm_other", sessionID: "ses_other" }),
    ])
    const announced = new Set<string>()
    try {
      await expect(
        notifyQuestions({
          ...f.args,
          announced,
          reply: async () => {
            throw new Error("offline")
          },
        }),
      ).rejects.toThrow("offline")
      expect(announced.size).toBe(0)
      await notifyQuestions({ ...f.args, announced })
      await notifyQuestions({ ...f.args, announced })
      expect(f.replies).toHaveLength(1)
      expect(f.replies[0]).toContain("/answer")
      expect(f.replies[0]).toContain("选个项目")
      expect([...announced]).toEqual(["frm_test"])
    } finally {
      f.server.stop(true)
    }
  })

  test("answers a numbered single choice using the current session form endpoint", async () => {
    const f = fixture()
    try {
      expect(await handleQuestionCommand({ ...f.args, text: "/answer frm_test 2" })).toBe(true)
      expect(f.changes).toEqual([
        { method: "POST", path: "/api/session/ses_test/form/frm_test/reply", body: { answer: { q0: "账本" } } },
      ])
      expect(f.replies[0]).toContain("答案已提交")
    } finally {
      f.server.stop(true)
    }
  })

  test.each(["自定义回答 含空格😀", "text:123"])('accepts a free text answer "%s"', async (text) => {
    const f = fixture()
    try {
      await handleQuestionCommand({ ...f.args, text: `/answer frm_test ${text}` })
      expect(f.changes[0].body).toEqual({ answer: { q0: text.replace(/^text:/, "") } })
    } finally {
      f.server.stop(true)
    }
  })

  test("answers multiple choice and multi-question forms", async () => {
    const fields: FormInfo["fields"] = [
      question().fields[0],
      {
        key: "q1",
        type: "multiselect",
        custom: true,
        options: [
          { value: "微信", label: "微信" },
          { value: "飞书", label: "飞书" },
        ],
      },
    ]
    const f = fixture([question({ fields })])
    try {
      await handleQuestionCommand({ ...f.args, text: '/answer frm_test [["1"],["1","2","其他"]]' })
      expect(f.changes[0].body).toEqual({ answer: { q0: "荔枝", q1: ["微信", "飞书", "其他"] } })
    } finally {
      f.server.stop(true)
    }
  })

  test("accepts comma separated multi-choice numbers", async () => {
    const f = fixture([
      question({
        fields: [
          {
            key: "q0",
            type: "multiselect",
            custom: true,
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
          },
        ],
      }),
    ])
    try {
      await handleQuestionCommand({ ...f.args, text: "/answer frm_test 1,2" })
      expect(f.changes[0].body).toEqual({ answer: { q0: ["a", "b"] } })
    } finally {
      f.server.stop(true)
    }
  })

  test.each(["0", "3", '[["1"],["2"]]', '[["1","2"]]', "[not json]", "text:"])(
    "rejects invalid answers before posting: %s",
    async (text) => {
      const f = fixture()
      try {
        await handleQuestionCommand({ ...f.args, text: `/answer frm_test ${text}` })
        expect(f.changes).toEqual([])
        expect(f.replies[0]).toContain("不正确")
      } finally {
        f.server.stop(true)
      }
    },
  )

  test("rejects text outside a fixed option list", async () => {
    const f = fixture([
      question({ fields: [{ key: "q0", type: "string", custom: false, options: [{ value: "a", label: "A" }] }] }),
    ])
    try {
      await handleQuestionCommand({ ...f.args, text: "/answer frm_test unknown" })
      expect(f.changes).toEqual([])
    } finally {
      f.server.stop(true)
    }
  })

  test("rejects non-owner chat commands without accessing forms", async () => {
    const f = fixture()
    try {
      for (const text of ["/questions", "/answer frm_test 1", "/reject-question frm_test"])
        await handleQuestionCommand({ ...f.args, owner: false, text })
      expect(f.requests).toEqual([])
      expect(f.changes).toEqual([])
    } finally {
      f.server.stop(true)
    }
  })

  test.each([
    question({ sessionID: "ses_other" }),
    question({ metadata: { kind: "oauth" } }),
    question({ fields: [{ key: "q0", type: "external", url: "https://example.com/auth" }] }),
  ])("does not answer or cancel unrelated forms", async (form) => {
    const f = fixture([form])
    try {
      await handleQuestionCommand({ ...f.args, text: "/answer frm_test 1" })
      await handleQuestionCommand({ ...f.args, text: "/reject-question frm_test" })
      expect(f.changes).toEqual([])
      expect(f.replies.every((text) => text.includes("已结束"))).toBe(true)
    } finally {
      f.server.stop(true)
    }
  })

  test("checks the fresh pending state before submitting", async () => {
    const f = fixture([question()], "cancelled")
    try {
      await handleQuestionCommand({ ...f.args, text: "/answer frm_test 1" })
      expect(f.changes).toEqual([])
      expect(f.replies[0]).toContain("已结束")
    } finally {
      f.server.stop(true)
    }
  })

  test.each(["get", "reply"])("handles a declared settled-form error during %s", async (stage) => {
    const methods: string[] = []
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => {
        methods.push(request.method)
        if (new URL(request.url).pathname.endsWith("/form")) return Response.json({ data: [question()] })
        if (stage === "reply" && request.method === "GET")
          return Response.json({ data: { ...question(), state: { status: "pending" } } })
        return Response.json(
          { _tag: "FormAlreadySettledError", id: "frm_test", message: "already answered" },
          { status: 409 },
        )
      },
    })
    const replies: string[] = []
    try {
      await handleQuestionCommand({
        client: OpenCode.make({ baseUrl: server.url.origin }),
        sessionID: "ses_test",
        owner: true,
        text: "/answer frm_test 1",
        reply: async (text) => {
          replies.push(text)
        },
      })
      expect(methods.filter((method) => method === "POST")).toHaveLength(stage === "reply" ? 1 : 0)
      expect(replies[0]).toContain("已结束")
    } finally {
      server.stop(true)
    }
  })

  test("requires a complete answer for each question and obeys multiselect bounds", async () => {
    const f = fixture([
      question({
        fields: [
          question().fields[0],
          {
            key: "q1",
            type: "multiselect",
            custom: true,
            minItems: 2,
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
          },
        ],
      }),
    ])
    try {
      for (const text of ["1", '[["1"]]', '[["1"],["1"]]'])
        await handleQuestionCommand({ ...f.args, text: `/answer frm_test ${text}` })
      expect(f.changes).toEqual([])
    } finally {
      f.server.stop(true)
    }
  })

  test("dismisses a pending question with explicit user feedback to the model", async () => {
    const f = fixture()
    try {
      await handleQuestionCommand({ ...f.args, text: "/reject-question frm_test" })
      expect(f.changes).toEqual([{ method: "DELETE", path: "/api/session/ses_test/form/frm_test" }])
      expect(f.replies[0]).toContain("已拒绝")
    } finally {
      f.server.stop(true)
    }
  })

  test("lists only the current session questions and leaves ordinary messages alone", async () => {
    const f = fixture()
    try {
      expect(await handleQuestionCommand({ ...f.args, text: "普通消息" })).toBe(false)
      expect(f.requests).toEqual([])
      expect(await handleQuestionCommand({ ...f.args, text: "/questions" })).toBe(true)
      expect(f.replies[0]).toContain("frm_test")
    } finally {
      f.server.stop(true)
    }
  })
})
