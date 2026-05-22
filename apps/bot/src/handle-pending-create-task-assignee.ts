import type { Context } from "grammy";
import { fetchUsers } from "./api";
import { confirmCreateTaskWithAssigneeId, CREATE_TASK_ASSIGNEE_OPEN_REPLY } from "./create-task-assignee-flow";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import {
  apiUserToCandidate,
  startPendingUserSelection,
} from "./pending-user-selection";
import {
  clearPendingCreateTaskAssignee,
  getPendingCreateTaskAssignee,
  isPendingCreateTaskAssigneeExpired,
} from "./pending-create-task-assignee";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import { resolveUsersByHint } from "./resolve-users-by-hint";
import { formatUserCandidates, userNotFoundMessage } from "./user-selection-format";

function isBareNumberReply(text: string): boolean {
  return /^\d+$/.test(text.trim());
}

/**
 * Ожидание исполнителя для create_task (открытый ответ: «мне» или имя).
 * Возвращает true, если сообщение обработано.
 */
export async function handlePendingCreateTaskAssigneeMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingCreateTaskAssignee(telegramUserId);
  if (!pending) return false;

  if (isPendingCreateTaskAssigneeExpired(pending)) {
    clearPendingCreateTaskAssignee(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingCreateTaskAssignee(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  if (isBareNumberReply(text)) {
    await ctx.reply(CREATE_TASK_ASSIGNEE_OPEN_REPLY);
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingCreateTaskAssignee(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  const trimmed = text.trim();
  const users = await fetchUsers();
  const match = resolveUsersByHint(users, trimmed, linked);

  if (match.kind === "none") {
    await ctx.reply(userNotFoundMessage(trimmed));
    return true;
  }

  if (match.kind === "many") {
    clearPendingCreateTaskAssignee(telegramUserId);
    startPendingUserSelection(
      telegramUserId,
      "select_user_for_task_assignee",
      match.users.map(apiUserToCandidate),
      {
        intent: "create_task",
        projectHint: pending.projectHint,
        title: pending.title,
        description: pending.description,
        deadlineDate: pending.deadlineDate,
        creatorId: pending.creatorId,
      },
    );
    await ctx.reply(formatUserCandidates(match.users.map(apiUserToCandidate)));
    return true;
  }

  clearPendingCreateTaskAssignee(telegramUserId);
  await confirmCreateTaskWithAssigneeId(ctx, telegramUserId, pending, match.user.id);
  return true;
}
