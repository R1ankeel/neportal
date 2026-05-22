import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { buildIntentPreview } from "./intent-preview";
import { setPendingConfirmation } from "./pending-intent";
import type { TaskSelectionPayload } from "./pending-task-selection";
import {
  buildResolvedAddTaskComment,
  startPendingTaskCommentDetails,
} from "./task-comment-flow";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";

/** AI intent add_task_comment с выбором задачи и уточнением текста. */
export async function handleAddTaskCommentIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
): Promise<void> {
  if (intent.intent !== "add_task_comment") return;

  const selectionPayload: TaskSelectionPayload = {};
  if (intent.payload.text?.trim()) {
    selectionPayload.commentText = intent.payload.text.trim();
  }

  const resolution = await resolveTaskByTitle(
    linked,
    intent.payload.taskTitle,
    "comment",
    { telegramUserId, selectionPayload },
  );

  if (resolution.kind !== "found") {
    await ctx.reply(resolveResultToMessage(resolution));
    return;
  }

  const task = resolution.task;

  if (selectionPayload.commentText) {
    const resolved = buildResolvedAddTaskComment(task, selectionPayload.commentText);
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent,
      resolved,
    });
    await ctx.reply(buildIntentPreview(resolved));
    return;
  }

  const question = startPendingTaskCommentDetails(telegramUserId, task);
  await ctx.reply(question);
}
