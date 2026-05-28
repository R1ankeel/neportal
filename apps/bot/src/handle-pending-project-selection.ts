import type { Context } from "grammy";
import { continueAfterProjectSelection } from "./continue-after-project-selection";
import { isConfirmationCancel } from "./confirmation";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import {
  clearPendingProjectSelection,
  getPendingProjectSelection,
  isPendingProjectSelectionExpired,
} from "./pending-project-selection";
import { clearPendingConfirmation } from "./pending-intent";
import { setConfirmationEditStep } from "./pending-confirmation-edit";

function parseSelectionNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export async function handlePendingProjectSelectionMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingProjectSelection(telegramUserId);
  if (!pending) return false;

  if (isPendingProjectSelectionExpired(pending)) {
    clearPendingProjectSelection(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isConfirmationCancel(text)) {
    const continuation = pending.continue;
    clearPendingProjectSelection(telegramUserId);
    if (continuation.kind === "confirmation_edit") {
      setConfirmationEditStep(telegramUserId, "await_value", "project");
      await ctx.reply("Ок, изменение проекта отменено.");
      return true;
    }
    clearPendingConfirmation(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  const num = parseSelectionNumber(text);
  if (num == null || num > pending.candidates.length) {
    await ctx.reply("Напишите номер проекта из списка.");
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingProjectSelection(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  const selected = pending.candidates[num - 1]!;
  const continuation = pending.continue;
  clearPendingProjectSelection(telegramUserId);

  await continueAfterProjectSelection(ctx, telegramUserId, selected, continuation);
  return true;
}
