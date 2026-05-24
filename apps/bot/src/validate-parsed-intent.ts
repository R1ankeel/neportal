import type { AiIntent } from "./ai-contracts";
import {
  validateAddTaskCommentPayload,
} from "./validate-add-task-comment-payload";

const QUESTION_MISSING_TASK = "К какой задаче добавить комментарий?";
const QUESTION_MISSING_COMMENT = "Какой комментарий добавить?";

export type ValidateIntentForRoutingResult = {
  intent: AiIntent;
  ok: boolean;
  reason?: string;
  clarificationMessage?: string;
};

/**
 * Смысловая проверка intent после LLM и до handlers.
 * Zod проверяет форму; здесь — безопасность payload для routing.
 */
export function validateIntentForRouting(params: {
  intent: AiIntent;
  userText: string;
}): ValidateIntentForRoutingResult {
  const { intent, userText } = params;

  if (intent.intent !== "add_task_comment") {
    return { intent, ok: true };
  }

  const validated = validateAddTaskCommentPayload({
    payload: intent.payload,
    userText,
  });

  const fixedIntent: AiIntent = {
    ...intent,
    payload: validated.payload,
  };

  if (validated.needsTaskQuery) {
    return {
      intent: fixedIntent,
      ok: false,
      reason: "missing_task",
      clarificationMessage: QUESTION_MISSING_TASK,
    };
  }

  if (validated.needsComment) {
    return {
      intent: fixedIntent,
      ok: false,
      reason: "missing_comment",
      clarificationMessage: QUESTION_MISSING_COMMENT,
    };
  }

  return { intent: fixedIntent, ok: true };
}
