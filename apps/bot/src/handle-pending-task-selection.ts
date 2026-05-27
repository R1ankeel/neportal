import type { Context } from "grammy";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import {
  clearPendingTaskSelection,
  getPendingTaskSelection,
  isPendingTaskSelectionExpired,
} from "./pending-task-selection";
import { continueAfterTaskSelection } from "./task-selection-continue";
import { candidateToApiTask } from "./pending-task-selection";
import { canCommentTask } from "./task-comment-flow";
import { canTransferTask, isManagerOrOwner } from "./task-transfer-flow";
import { canModifyTask } from "./task-status-flow";
import { canReadTask } from "./task-read-access";

function parseSelectionNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * Обработка выбора задачи по номеру. Возвращает true, если сообщение обработано.
 */
export async function handlePendingTaskSelectionMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingTaskSelection(telegramUserId);
  if (!pending) return false;

  if (isPendingTaskSelectionExpired(pending)) {
    clearPendingTaskSelection(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingTaskSelection(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  const num = parseSelectionNumber(text);
  if (num == null || num > pending.candidates.length) {
    await ctx.reply("Напишите номер задачи из списка.");
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingTaskSelection(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  const selected = pending.candidates[num - 1];
  const task = candidateToApiTask(selected);

  const canAct =
    pending.type === "select_task_for_comments_list"
      ? canReadTask(linked, task)
      : pending.type === "select_task_for_comment"
        ? canCommentTask(linked, task)
        : pending.type === "select_task_for_transfer"
        ? canTransferTask(linked, task)
        : pending.type === "select_task_for_reassign"
          ? isManagerOrOwner(linked.role)
          : canModifyTask(linked, task);
  if (!canAct) {
    clearPendingTaskSelection(telegramUserId);
    const msg =
      pending.type === "select_task_for_comment"
        ? "Вы не можете комментировать эту задачу."
        : pending.type === "select_task_for_comments_list"
          ? "Вы не можете просматривать комментарии этой задачи."
          : pending.type === "select_task_for_transfer"
          ? "Вы не можете передать эту задачу."
          : pending.type === "select_task_for_reassign"
            ? "Только руководитель или менеджер может менять задачи сотрудников."
            : "Вы не можете изменить эту задачу.";
    await ctx.reply(msg);
    return true;
  }

  const { type, payload } = pending;
  clearPendingTaskSelection(telegramUserId);

  await continueAfterTaskSelection(ctx, telegramUserId, selected, type, payload);
  return true;
}
