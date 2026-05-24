import type { AiIntent } from "./ai-contracts";
import {
  normalizeBasicTaskTitle,
  stripTitleFillers,
} from "./ai/deterministic/basic-create-task-text";
import { parseBasicCreateTask } from "./ai/deterministic/parse-basic-create-task";

/**
 * Синхронный разбор без LLM-cleanup (для dev-checks).
 * В продакшене используйте {@link finalizeBasicCreateTask}.
 */
export function parseCreateTaskQuery(
  text: string,
): Extract<AiIntent, { intent: "create_task" }> | null {
  const parsed = parseBasicCreateTask(text);
  if (!parsed) return null;

  const title = normalizeBasicTaskTitle(stripTitleFillers(parsed.payload.rawTitle));
  if (!title) return null;

  const payload: Extract<AiIntent, { intent: "create_task" }>["payload"] = { title };
  if (parsed.payload.assigneeHint) payload.assigneeHint = parsed.payload.assigneeHint;
  if (parsed.payload.deadlineDate) payload.deadlineDate = parsed.payload.deadlineDate;

  return {
    intent: "create_task",
    confidence: parsed.confidence,
    requiresConfirmation: parsed.requiresConfirmation,
    payload,
  };
}

export { finalizeBasicCreateTask } from "./finalize-basic-create-task";
