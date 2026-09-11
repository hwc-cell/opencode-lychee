import { expect, test } from "bun:test"
import { isMissingQuestionError } from "../src/routes/session/question-error"

test("recognizes wrapped SDK 404 errors", () => {
  expect(
    isMissingQuestionError(
      new Error("Question not found", {
        cause: { body: { _tag: "QuestionNotFoundError" }, status: 404 },
      }),
    ),
  ).toBe(true)
})

test("does not dismiss a question for an unrelated transport error", () => {
  expect(isMissingQuestionError(new Error("connection lost"))).toBe(false)
})
