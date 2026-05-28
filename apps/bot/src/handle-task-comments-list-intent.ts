import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { replyWithTaskCommentsForHint } from "./task-comments-list-flow";

function getTaskHintFromPayload(payload: {
  taskQuery?: string;
  taskTitle?: string;
  taskId?: string;
}): { hint: string; taskId?: string } {
  const taskId = payload.taskId?.trim() || undefined;
  const hint = payload.taskQuery?.trim() || payload.taskTitle?.trim() || "";
  return { hint, taskId };
}

/** AI / validated intent list_task_comments. */
export async function handleListTaskCommentsIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
): Promise<void> {
  if (intent.intent !== "list_task_comments") return;

  const { hint, taskId } = getTaskHintFromPayload(intent.payload);
  if (!hint && !taskId) {
    await ctx.reply("Укажите название задачи, например: «Покажи комментарии по задаче склад».");
    return;
  }

  await replyWithTaskCommentsForHint(
    ctx,
    linked,
    telegramUserId,
    hint,
    taskId,
    intent.payload.projectHint,
  );
}
