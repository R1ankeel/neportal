import type { Context } from "grammy";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import {
  formatReceiptUploadPrompt,
  formatExpenseDescription,
} from "./pending-expenses-flow";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import {
  clearPendingExpenseReceiptSelection,
  getPendingExpenseReceiptSelection,
  isPendingExpenseReceiptSelectionExpired,
} from "./pending-expense-receipt-selection";
import { startPendingExpenseReceiptUpload } from "./pending-expense-receipt-upload";

function parseSelectionNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export async function handlePendingExpenseReceiptSelectionMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingExpenseReceiptSelection(telegramUserId);
  if (!pending) return false;

  if (isPendingExpenseReceiptSelectionExpired(pending)) {
    clearPendingExpenseReceiptSelection(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingExpenseReceiptSelection(telegramUserId);
    await ctx.reply("Ок, отменено.");
    return true;
  }

  const num = parseSelectionNumber(text);
  if (num == null || num > pending.expenses.length) {
    await ctx.reply("Напишите номер расхода из списка или «отмена».");
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingExpenseReceiptSelection(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  const selected = pending.expenses[num - 1];
  clearPendingExpenseReceiptSelection(telegramUserId);

  startPendingExpenseReceiptUpload(telegramUserId, {
    expenseId: selected.id,
    amount: selected.amount,
    description: formatExpenseDescription(selected.description),
    budgetName: selected.budgetName,
    uploadedById: linked.id,
  });

  await ctx.reply(formatReceiptUploadPrompt(selected.amount, selected.description));
  return true;
}
