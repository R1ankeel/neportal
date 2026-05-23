import { createExpenseAttachment } from "./api";

export type TelegramReceiptFileMeta = {
  telegramFileId: string;
  originalFilename?: string;
  mimeType?: string;
};

/** Прикрепляет чек из Telegram к расходу (POST /budget-expenses/:id/attachments). */
export async function attachTelegramReceiptToExpense(
  expenseId: string,
  uploadedById: string,
  file: TelegramReceiptFileMeta,
): Promise<void> {
  await createExpenseAttachment(expenseId, {
    telegramFileId: file.telegramFileId,
    originalFilename: file.originalFilename,
    mimeType: file.mimeType,
    uploadedById,
  });
}
