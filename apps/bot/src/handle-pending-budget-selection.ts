import type { Context } from "grammy";
import { confirmCreateExpenseAfterBudgetSelection } from "./create-expense-flow";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { buildIntentPreview } from "./intent-preview";
import type { ApiProject } from "./api";
import { isConfirmationCancel } from "./confirmation";
import {
  clearPendingBudgetSelection,
  getPendingBudgetSelection,
  isPendingBudgetSelectionExpired,
} from "./pending-budget-selection";

function parseSelectionNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export async function handlePendingBudgetSelectionMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingBudgetSelection(telegramUserId);
  if (!pending) return false;

  if (isPendingBudgetSelectionExpired(pending)) {
    clearPendingBudgetSelection(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isConfirmationCancel(text)) {
    clearPendingBudgetSelection(telegramUserId);
    await ctx.reply("Ок, расход отменён.");
    return true;
  }

  const num = parseSelectionNumber(text);
  if (num == null || num > pending.candidates.length) {
    await ctx.reply("Напишите номер бюджета из списка.");
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingBudgetSelection(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  const selected = pending.candidates[num - 1];
  const payload = pending.payload;
  clearPendingBudgetSelection(telegramUserId);

  const project: ApiProject = { id: payload.projectId, name: payload.projectName };
  const resolved = confirmCreateExpenseAfterBudgetSelection(
    telegramUserId,
    project,
    payload,
    selected,
  );

  await ctx.reply(buildIntentPreview(resolved));
  return true;
}
