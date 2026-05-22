import type { Context } from "grammy";
import type { ApiUser } from "./api";
import { buildIntentPreview } from "./intent-preview";
import type { ResolvedSetTaskDeadline } from "./intent-resolver";
import { setPendingConfirmation } from "./pending-intent";
import { parseDeadlineCommandPayload } from "./parse-ru-date";
import { resolveResultToMessage, resolveTaskByTitle } from "./resolve-task-by-title";

export const DEADLINE_USAGE = "Использование: /deadline <название задачи> <дата>";

/** /deadline с confirmation и выбором задачи при неоднозначности. */
export async function handleDeadlineSlashCommand(
  ctx: Context,
  currentUser: ApiUser,
  telegramUserId: number,
  payload: string,
): Promise<string | null> {
  const parsed = parseDeadlineCommandPayload(payload);
  if (!parsed) return DEADLINE_USAGE;

  const resolution = await resolveTaskByTitle(currentUser, parsed.title, "deadline", {
    telegramUserId,
    selectionPayload: { deadlineDate: parsed.dateIso },
  });

  if (resolution.kind !== "found") {
    return resolveResultToMessage(resolution);
  }

  const resolved: ResolvedSetTaskDeadline = {
    intent: "set_task_deadline",
    taskId: resolution.task.id,
    taskTitle: resolution.task.title,
    deadlineDate: parsed.dateIso,
    projectName: resolution.task.project?.name,
  };

  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent: {
      intent: "set_task_deadline",
      confidence: 1,
      requiresConfirmation: true,
      payload: {
        taskTitle: resolved.taskTitle,
        deadlineDate: resolved.deadlineDate,
      },
    },
    resolved,
  });

  await ctx.reply(buildIntentPreview(resolved));
  return null;
}
