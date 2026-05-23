import type { Context } from "grammy";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { confirmCancelAbsence } from "./absence-cancel-flow";
import {
  clearPendingAbsenceSelection,
  getPendingAbsenceSelection,
  isPendingAbsenceSelectionExpired,
} from "./pending-absence-selection";
import { isPendingDetailsCancel } from "./pending-task-status-details";

function parseSelectionNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export async function handlePendingAbsenceSelectionMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingAbsenceSelection(telegramUserId);
  if (!pending) return false;

  if (isPendingAbsenceSelectionExpired(pending)) {
    clearPendingAbsenceSelection(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingAbsenceSelection(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  const num = parseSelectionNumber(text);
  if (num == null || num > pending.candidates.length) {
    await ctx.reply("Напишите номер из списка.");
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingAbsenceSelection(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  const selected = pending.candidates[num - 1];
  const { cancellationReason } = pending.payload;
  clearPendingAbsenceSelection(telegramUserId);

  await confirmCancelAbsence(ctx, telegramUserId, linked, selected, cancellationReason);
  return true;
}
