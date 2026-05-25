import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import { buildAddTaskCommentPayload } from "./add-task-comment-payload";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { handleAddTaskCommentIntent } from "./handle-task-comment-intent";
import { replyWithIntentPreview } from "./intent-preview";
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
import { questionForMissingComment } from "./task-comment-flow";

function syntheticCommentIntent(
  taskTitle: string,
  comment: string,
): AiIntent {
  return {
    intent: "add_task_comment",
    confidence: 1,
    requiresConfirmation: true,
    payload: buildAddTaskCommentPayload({ taskTitle, comment }),
  };
}

/**
 * Ожидание текста комментария или уточнения задачи. Возвращает true, если сообщение обработано.
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

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingTaskCommentDetails(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  if (pending.type === "awaiting_task_for_comment") {
    const taskQuery = text.trim();
    if (!taskQuery) {
      await ctx.reply("К какой задаче добавить комментарий?");
      return true;
    }

    clearPendingTaskCommentDetails(telegramUserId);
    const intent: AiIntent = {
      intent: "add_task_comment",
      confidence: 1,
      requiresConfirmation: true,
      payload: buildAddTaskCommentPayload({
        taskQuery,
        comment: pending.commentText,
      }),
    };
    await handleAddTaskCommentIntent(ctx, linked, telegramUserId, intent);
    return true;
  }

  const commentText = text.trim();
  if (!commentText) {
    await ctx.reply(questionForMissingComment());
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

  await replyWithIntentPreview(ctx, telegramUserId, resolved);
  return true;
}
