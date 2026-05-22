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
import { canModifyTask } from "./task-status-flow";

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

  if (!canModifyTask(linked, task)) {
    clearPendingTaskSelection(telegramUserId);
    await ctx.reply("Вы не можете изменить эту задачу.");
    return true;
  }

  const { type, payload } = pending;
  clearPendingTaskSelection(telegramUserId);

  await continueAfterTaskSelection(ctx, telegramUserId, selected, type, payload);
  return true;
}
