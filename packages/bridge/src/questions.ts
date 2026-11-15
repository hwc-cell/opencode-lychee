import type { FormAnswer, FormInfo, FormMultiselectField, FormStringField, OpenCodeClient } from "@opencode/client"
import { bridgeLang } from "./i18n"

type Client = { session: Pick<OpenCodeClient["session"], "form"> }
type QuestionField = FormStringField | FormMultiselectField
type QuestionForm = Omit<FormInfo, "fields"> & { fields: [QuestionField, ...QuestionField[]] }

const tr = (zh: string, en: string) => (bridgeLang() === "en" ? en : zh)
const usage = () =>
  tr(
    '用法：/answer <编号> <答案>；单选填选项序号，多选填 1,3；多题按顺序填 JSON，如 [["1"],["自定义答案"]]。text: 前缀表示原样文字。',
    'Usage: /answer <id> <answer>; choose an option number, or 1,3 for multiple choices. For multiple questions use JSON, e.g. [["1"],["custom answer"]]. Use text: for literal text.',
  )
const expired = () =>
  tr(
    "该追问已结束或不属于当前会话，请用 /questions 查看待回答问题。",
    "This question ended or belongs to another session. Use /questions to list pending questions.",
  )

function questionForm(form: FormInfo): form is QuestionForm {
  return (
    form.metadata?.kind === "question" &&
    form.fields.every(
      (field, index) =>
        field.key === `q${index}` &&
        (field.type === "string" || field.type === "multiselect") &&
        !field.hidden &&
        !field.when?.length,
    )
  )
}

function notice(form: QuestionForm) {
  return [
    tr("❓ AI 需要你回答", "❓ The AI needs your answer"),
    ...form.fields.flatMap((field, index) => [
      `${index + 1}. ${field.description ?? field.title ?? field.key}${field.type === "multiselect" ? tr("（可多选）", " (multiple choices)") : ""}`,
      ...(field.options ?? []).map(
        (option, choice) => `  ${choice + 1}) ${option.label}${option.description ? ` — ${option.description}` : ""}`,
      ),
    ]),
    tr(`编号：${form.id}`, `ID: ${form.id}`),
    usage(),
    tr(`拒绝回答：/reject-question ${form.id}`, `Dismiss: /reject-question ${form.id}`),
  ].join("\n")
}

export async function notifyQuestions(args: {
  client: Client
  sessionID: string
  announced: Set<string>
  reply: (text: string) => Promise<void>
}) {
  const pending = await args.client.session.form.list(
    { sessionID: args.sessionID },
    { signal: AbortSignal.timeout(5000) },
  )
  for (const form of pending) {
    if (form.sessionID !== args.sessionID || !questionForm(form) || args.announced.has(form.id)) continue
    await args.reply(notice(form))
    args.announced.add(form.id)
  }
}

export async function handleQuestionCommand(args: {
  client: Client
  sessionID?: string
  text: string
  owner: boolean
  reply: (text: string) => Promise<void>
}): Promise<boolean> {
  const match = args.text.trim().match(/^\/(questions|answer|reject-question)(?:\s+(\S+))?(?:\s+([\s\S]*))?$/i)
  if (!match) return false
  if (!args.owner) {
    await args.reply(
      tr(
        "🔒 请用扫码账号私聊回答问题；群聊中的问题请在 OpenCode 中处理。",
        "🔒 Answer in a direct chat from the QR-login account. Handle group questions in OpenCode.",
      ),
    )
    return true
  }
  const command = match[1].toLowerCase()
  const formID = match[2]
  const raw = match[3]?.trim()
  if (
    (command === "questions" && formID) ||
    (command === "answer" && (!formID || !raw)) ||
    (command === "reject-question" && (!formID || raw))
  ) {
    await args.reply(
      command === "reject-question" ? tr("用法：/reject-question <编号>", "Usage: /reject-question <id>") : usage(),
    )
    return true
  }
  if (!args.sessionID) {
    await args.reply(tr("当前会话没有待回答的问题。", "No question is pending in this session."))
    return true
  }
  const pending = (
    await args.client.session.form.list({ sessionID: args.sessionID }, { signal: AbortSignal.timeout(5000) })
  ).filter((form): form is QuestionForm => form.sessionID === args.sessionID && questionForm(form))
  if (command === "questions") {
    if (!pending.length) await args.reply(tr("当前会话没有待回答的问题。", "No question is pending in this session."))
    for (const form of pending) await args.reply(notice(form))
    return true
  }
  const form = pending.find((form) => form.id === formID)
  if (!form) {
    await args.reply(expired())
    return true
  }
  const detail = await args.client.session.form
    .get({ sessionID: args.sessionID, formID: form.id }, { signal: AbortSignal.timeout(5000) })
    .catch((error: unknown) => {
      if (settled(error)) return undefined
      throw error
    })
  if (!detail || detail.state.status !== "pending" || detail.sessionID !== args.sessionID || !questionForm(detail)) {
    await args.reply(expired())
    return true
  }
  const answer = command === "answer" ? parseAnswer(detail, raw!) : undefined
  if (command === "answer" && !answer) {
    await args.reply(
      tr("答案格式、选项编号或题数不正确。\n", "Invalid answer format, option number, or question count.\n") + usage(),
    )
    return true
  }
  const submitted = await (
    command === "answer"
      ? args.client.session.form.reply(
          { sessionID: args.sessionID, formID: form.id, answer: answer! },
          { signal: AbortSignal.timeout(5000) },
        )
      : args.client.session.form.cancel(
          {
            sessionID: args.sessionID,
            formID: form.id,
            message: tr("用户通过微信拒绝回答此问题。", "The user dismissed this question in WeChat."),
          },
          { signal: AbortSignal.timeout(5000) },
        )
  )
    .then(() => true)
    .catch((error: unknown) => {
      if (settled(error)) return false
      throw error
    })
  await args.reply(
    !submitted
      ? expired()
      : command === "answer"
        ? tr("✅ 答案已提交，AI 将继续处理。", "✅ Answer submitted. The AI will continue.")
        : tr("已拒绝回答该问题。", "Question dismissed."),
  )
  return true
}

function parseAnswer(form: QuestionForm, raw: string): FormAnswer | undefined {
  let values: unknown
  if (raw.startsWith("[")) {
    try {
      values = JSON.parse(raw)
    } catch {
      return
    }
  } else {
    if (form.fields.length !== 1) return
    values = [
      raw.startsWith("text:")
        ? [raw]
        : form.fields[0].type === "multiselect"
          ? raw.split(/[,，]/).map((value) => value.trim())
          : [raw],
    ]
  }
  if (!Array.isArray(values) || values.length !== form.fields.length) return
  const answer: FormAnswer = {}
  for (const [index, field] of form.fields.entries()) {
    const row = typeof values[index] === "string" ? [values[index]] : values[index]
    if (!Array.isArray(row) || !row.length || row.some((value) => typeof value !== "string" || !value.trim())) return
    if (field.type === "string" && row.length !== 1) return
    const options = field.options ?? []
    const selections: string[] = []
    for (const value of row as string[]) {
      const literal = value.startsWith("text:")
      const text = literal ? value.slice(5) : value
      if (!text.trim()) return
      if (!literal && options.length && /^\d+$/.test(text)) {
        const option = options[Number(text) - 1]
        if (!option) return
        selections.push(option.value)
        continue
      }
      const option = options.find((option) => option.value === text || option.label === text)
      if (option) selections.push(option.value)
      else if (field.custom || !options.length) selections.push(text)
      else return
    }
    const selected = [...new Set(selections)]
    if (
      field.type === "multiselect" &&
      ((field.minItems !== undefined && selected.length < field.minItems) ||
        (field.maxItems !== undefined && selected.length > field.maxItems))
    )
      return
    answer[field.key] = field.type === "multiselect" ? selected : selected[0]
  }
  return answer
}

function settled(error: unknown) {
  if (!error || typeof error !== "object") return false
  const tag = (error as { _tag?: unknown })._tag
  if (tag === "FormNotFoundError" || tag === "FormAlreadySettledError") return true
  const status = (error as { status?: unknown }).status
  if (status === 404 || status === 409) return true
  const cause = (error as { cause?: { status?: unknown } }).cause
  return cause?.status === 404 || cause?.status === 409
}
