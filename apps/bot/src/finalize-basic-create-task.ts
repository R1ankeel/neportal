import type { AiIntent } from "./ai-contracts";
import { cleanupTaskTitleWithAi } from "./ai/cleanup-task-title";
import {
  normalizeBasicTaskTitle,
  stripTitleFillers,
} from "./ai/deterministic/basic-create-task-text";
import {
  parseBasicCreateTask,
  type ParseBasicCreateTaskOptions,
} from "./ai/deterministic/parse-basic-create-task";

export type { ParseBasicCreateTaskOptions };

/**
 * Детерминированный basic create_task + опциональный cleanup title.
 */
export async function finalizeBasicCreateTask(
  text: string,
  options?: ParseBasicCreateTaskOptions,
): Promise<Extract<AiIntent, { intent: "create_task" }> | null> {
  const parsed = parseBasicCreateTask(text, options);
  if (!parsed) return null;

  const { rawTitle, assigneeHint, deadlineDate } = parsed.payload;
  let title: string;

  if (parsed.meta.needsCleanup) {
    title = await cleanupTaskTitleWithAi(rawTitle);
  } else {
    title = normalizeBasicTaskTitle(stripTitleFillers(rawTitle));
  }

  if (!title.trim()) return null;

  const payload: Extract<AiIntent, { intent: "create_task" }>["payload"] = { title };
  if (assigneeHint) payload.assigneeHint = assigneeHint;
  if (deadlineDate) payload.deadlineDate = deadlineDate;

  return {
    intent: "create_task",
    confidence: parsed.confidence,
    requiresConfirmation: parsed.requiresConfirmation,
    payload,
  };
}
