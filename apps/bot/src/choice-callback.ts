import type { Context } from "grammy";
import { getActiveChoice } from "./choice-state";
import { handlePendingConfirmationEditMessage } from "./confirmation-edit";
import { handlePendingAbsenceSelectionMessage } from "./handle-pending-absence-selection";
import { handlePendingBudgetSelectionMessage } from "./handle-pending-budget-selection";
import { handlePendingExpenseReceiptSelectionMessage } from "./handle-pending-expense-receipt-selection";
import { handlePendingTaskSelectionMessage } from "./handle-pending-task-selection";
import { handlePendingUserSelectionMessage } from "./handle-pending-user-selection";
import { parseChoiceCallbackData } from "./telegram/keyboards/choice-keyboard";

async function removeInlineKeyboard(ctx: Context): Promise<void> {
  try {
    await ctx.editMessageReplyMarkup(undefined);
  } catch {
    // Message may be too old, already edited, or already without markup.
  }
}

async function dispatchChoiceText(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  if (await handlePendingConfirmationEditMessage(ctx, telegramUserId, text)) return true;
  if (await handlePendingExpenseReceiptSelectionMessage(ctx, telegramUserId, text)) return true;
  if (await handlePendingBudgetSelectionMessage(ctx, telegramUserId, text)) return true;
  if (await handlePendingAbsenceSelectionMessage(ctx, telegramUserId, text)) return true;
  if (await handlePendingTaskSelectionMessage(ctx, telegramUserId, text)) return true;
  if (await handlePendingUserSelectionMessage(ctx, telegramUserId, text)) return true;
  return false;
}

export async function handleChoiceCallback(ctx: Context): Promise<void> {
  const parsed = parseChoiceCallbackData(ctx.callbackQuery?.data);
  if (!parsed) return;

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId || parsed.ownerTelegramUserId !== telegramUserId) {
    await ctx.answerCallbackQuery({
      text: "Этот выбор не для вас или уже устарел.",
      show_alert: false,
    });
    return;
  }

  const choice = getActiveChoice(telegramUserId);
  if (!choice) {
    await ctx.answerCallbackQuery({
      text: "Этот выбор уже обработан или устарел.",
      show_alert: false,
    });
    await removeInlineKeyboard(ctx);
    return;
  }

  if (choice.choiceId !== parsed.choiceId) {
    await ctx.answerCallbackQuery({
      text: "Этот выбор уже обработан или устарел.",
      show_alert: false,
    });
    await removeInlineKeyboard(ctx);
    return;
  }

  if (
    parsed.action === "select" &&
    (parsed.optionIndex === undefined || parsed.optionIndex >= choice.optionCount)
  ) {
    await ctx.answerCallbackQuery({
      text: "Некорректный выбор.",
      show_alert: false,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  const text = parsed.action === "cancel" ? "отмена" : String((parsed.optionIndex ?? 0) + 1);
  const handled = await dispatchChoiceText(ctx, telegramUserId, text);
  if (handled) {
    await removeInlineKeyboard(ctx);
  }
}
