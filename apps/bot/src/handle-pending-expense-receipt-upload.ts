import type { Context } from "grammy";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import {
  clearPendingExpenseReceiptUpload,
  getPendingExpenseReceiptUpload,
  isPendingExpenseReceiptUploadExpired,
} from "./pending-expense-receipt-upload";
import { formatMoney } from "./api";

export async function handlePendingExpenseReceiptUploadMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingExpenseReceiptUpload(telegramUserId);
  if (!pending) return false;

  if (isPendingExpenseReceiptUploadExpired(pending)) {
    clearPendingExpenseReceiptUpload(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingExpenseReceiptUpload(telegramUserId);
    await ctx.reply("Ок, отменено.");
    return true;
  }

  const amountLabel = formatMoney(pending.amount);
  await ctx.reply(
    `Ожидаю фото или документ чека для расхода ${amountLabel}. Отправьте файл или напишите «отмена».`,
  );
  return true;
}
