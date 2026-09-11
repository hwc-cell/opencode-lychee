const missingQuestionErrors = new Set(["QuestionNotFoundError", "FormNotFoundError"])

export function isMissingQuestionError(error: unknown) {
  const pending = [error]
  const seen = new Set<object>()
  while (pending.length > 0) {
    const item = pending.shift()
    if (item === null || typeof item !== "object" || seen.has(item)) continue
    seen.add(item)
    if ("status" in item && item.status === 404) return true
    if ("name" in item && missingQuestionErrors.has(String(item.name))) return true
    if ("_tag" in item && missingQuestionErrors.has(String(item._tag))) return true
    if ("cause" in item) pending.push(item.cause)
    if ("body" in item) pending.push(item.body)
  }
  return false
}
