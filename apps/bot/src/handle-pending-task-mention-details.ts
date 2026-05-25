import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { replyWithIntentPreview } from "./intent-preview";
import type { ResolvedMentionInTask } from "./intent-resolver";
import {
  clearPendingConfirmation,
  setPendingConfirmation,
} from "./pending-intent";
import {
  clearPendingTaskMentionDetails,
  getPendingTaskMentionDetails,
  isPendingTaskMentionDetailsExpired,
} from "./pending-task-mention-details";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import { questionForMentionText } from "./task-mention-flow";

function syntheticMentionIntent(
  userHint: string,
  taskTitle: string,
  text: string,
): AiIntent {
  return {
    intent: "mention_in_task",
    confidence: 1,
    requiresConfirmation: true,
    payload: { userHint, taskTitle, text },
  };
}

export async function handlePendingTaskMentionDetailsMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingTaskMentionDetails(telegramUserId);
  if (!pending) return false;

  if (isPendingTaskMentionDetailsExpired(pending)) {
    clearPendingTaskMentionDetails(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingTaskMentionDetails(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  const mentionText = text.trim();
  if (!mentionText) {
    await ctx.reply(
      questionForMentionText(pending.mentionedUserName, pending.taskTitle),
    );
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingTaskMentionDetails(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  const resolved: ResolvedMentionInTask = {
    intent: "mention_in_task",
    taskId: pending.taskId,
    taskTitle: pending.taskTitle,
    text: mentionText,
    mentionedUserId: pending.mentionedUserId,
    mentionedUserName: pending.mentionedUserName,
    mentionedUserTelegramId: null,
    creatorId: pending.creatorId,
    assigneeId: pending.assigneeId,
  };

  clearPendingTaskMentionDetails(telegramUserId);
  clearPendingConfirmation(telegramUserId);
  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent: syntheticMentionIntent(
      pending.mentionedUserName,
      pending.taskTitle,
      mentionText,
    ),
    resolved,
  });

  await replyWithIntentPreview(ctx, telegramUserId, resolved);
  return true;
}
