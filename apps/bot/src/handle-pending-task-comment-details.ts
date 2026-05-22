import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { buildIntentPreview } from "./intent-preview";
import {
  clearPendingConfirmation,
  setPendingConfirmation,
} from "./pending-intent";
import {
  clearPendingTaskCommentDetails,
  getPendingTaskCommentDetails,
  isPendingTaskCommentDetailsExpired,
} from "./pending-task-comment-details";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import type { ResolvedAddTaskComment } from "./intent-resolver";

function syntheticCommentIntent(
  taskTitle: string,
  text: string,
): AiIntent {
  return {
    intent: "add_task_comment",
    confidence: 1,
    requiresConfirmation: true,
    payload: { taskTitle, text },
  };
}

/**
 * Ожидание текста комментария. Возвращает true, если сообщение обработано.
 */
export async function handlePendingTaskCommentDetailsMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingTaskCommentDetails(telegramUserId);
  if (!pending) return false;

  if (isPendingTaskCommentDetailsExpired(pending)) {
    clearPendingTaskCommentDetails(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingTaskCommentDetails(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  const commentText = text.trim();
  if (!commentText) {
    await ctx.reply(questionForEmptyComment(pending.taskTitle));
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingTaskCommentDetails(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  const resolved: ResolvedAddTaskComment = {
    intent: "add_task_comment",
    taskId: pending.taskId,
    taskTitle: pending.taskTitle,
    text: commentText,
    creatorId: pending.creatorId,
    assigneeId: pending.assigneeId,
  };

  clearPendingTaskCommentDetails(telegramUserId);
  clearPendingConfirmation(telegramUserId);
  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent: syntheticCommentIntent(pending.taskTitle, commentText),
    resolved,
  });

  await ctx.reply(buildIntentPreview(resolved));
  return true;
}

function questionForEmptyComment(taskTitle: string): string {
  return `Что написать в комментарии к задаче «${taskTitle}»?`;
}
