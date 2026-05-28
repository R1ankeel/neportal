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
import { fetchTaskById, fetchUsers } from "./api";
import { gateMentionProjectMembership } from "./mention-project-membership";

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

  const users = await fetchUsers();
  const mentionedUser = users.find((u) => u.id === pending.mentionedUserId);
  if (!mentionedUser) {
    clearPendingTaskMentionDetails(telegramUserId);
    await ctx.reply("Сотрудник не найден. Повторите команду.");
    return true;
  }

  const task = await fetchTaskById(pending.taskId, linked.id);
  if (!task) {
    clearPendingTaskMentionDetails(telegramUserId);
    await ctx.reply("Задача не найдена или больше недоступна.");
    return true;
  }

  const resolved: ResolvedMentionInTask = {
    intent: "mention_in_task",
    taskId: pending.taskId,
    taskTitle: task.title,
    text: mentionText,
    mentionedUserId: pending.mentionedUserId,
    mentionedUserName: pending.mentionedUserName,
    mentionedUserTelegramId: mentionedUser.telegramId ?? null,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    projectName: task.project?.name,
  };

  const canProceed = await gateMentionProjectMembership(
    ctx,
    telegramUserId,
    linked,
    task,
    mentionedUser,
    resolved,
    "mention_in_task",
    "preview",
  );
  if (!canProceed) {
    clearPendingTaskMentionDetails(telegramUserId);
    return true;
  }

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
