import type { Context } from "grammy";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import {
  clearPendingUserSelection,
  getPendingUserSelection,
  isPendingUserSelectionExpired,
} from "./pending-user-selection";
import { continueAfterUserSelection } from "./user-selection-continue";

function parseSelectionNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * Обработка выбора сотрудника по номеру. Возвращает true, если сообщение обработано.
 */
export async function handlePendingUserSelectionMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingUserSelection(telegramUserId);
  if (!pending) return false;

  if (isPendingUserSelectionExpired(pending)) {
    clearPendingUserSelection(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingUserSelection(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  const num = parseSelectionNumber(text);
  if (num == null || num > pending.candidates.length) {
    await ctx.reply("Напишите номер сотрудника из списка.");
    return true;
  }

  const selected = pending.candidates[num - 1];
  const { type, payload } = pending;
  clearPendingUserSelection(telegramUserId);

  await continueAfterUserSelection(ctx, telegramUserId, selected, type, payload);
  return true;
}
