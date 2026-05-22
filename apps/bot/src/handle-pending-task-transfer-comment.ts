import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import { fetchUsers } from "./api";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { buildIntentPreview } from "./intent-preview";
import type { ResolvedTransferTask } from "./intent-resolver";
import {
  clearPendingConfirmation,
  setPendingConfirmation,
} from "./pending-intent";
import {
  clearPendingTaskTransferComment,
  getPendingTaskTransferComment,
  isPendingTaskTransferCommentExpired,
} from "./pending-task-transfer-comment";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import { questionForTransferComment } from "./task-transfer-flow";

function syntheticTransferIntent(
  taskTitle: string,
  toUserHint: string,
  comment: string,
): AiIntent {
  return {
    intent: "transfer_task",
    confidence: 1,
    requiresConfirmation: true,
    payload: { taskTitle, toUserHint, comment },
  };
}

export async function handlePendingTaskTransferCommentMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingTaskTransferComment(telegramUserId);
  if (!pending) return false;

  if (isPendingTaskTransferCommentExpired(pending)) {
    clearPendingTaskTransferComment(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingTaskTransferComment(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  const commentText = text.trim();
  if (!commentText) {
    await ctx.reply(questionForTransferComment(pending.taskTitle));
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingTaskTransferComment(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  const users = await fetchUsers();
  const toUser = users.find((u) => u.id === pending.toUserId);

  const resolved: ResolvedTransferTask = {
    intent: "transfer_task",
    taskId: pending.taskId,
    taskTitle: pending.taskTitle,
    comment: commentText,
    toUserId: pending.toUserId,
    toUserName: pending.toUserName,
    toUserTelegramId: toUser?.telegramId ?? null,
    requestedByRole: linked.role,
    currentAssigneeId: null,
  };

  clearPendingTaskTransferComment(telegramUserId);
  clearPendingConfirmation(telegramUserId);
  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent: syntheticTransferIntent(
      pending.taskTitle,
      pending.toUserName,
      commentText,
    ),
    resolved,
  });

  await ctx.reply(buildIntentPreview(resolved));
  return true;
}
