import type { Context } from "grammy";
import { handleConfirmationDecision } from "./confirmation-decision";
import { getPendingConfirmation } from "./pending-intent";
import { parseConfirmationCallbackData } from "./telegram/keyboards/confirmation-keyboard";

async function removeInlineKeyboard(ctx: Context): Promise<void> {
  try {
    await ctx.editMessageReplyMarkup(undefined);
  } catch {
    // Message may be too old, already edited, or not editable by this bot.
  }
}

export async function handleConfirmationCallback(ctx: Context): Promise<void> {
  const parsed = parseConfirmationCallbackData(ctx.callbackQuery?.data);
  if (!parsed) return;

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await ctx.answerCallbackQuery({
      text: "Это подтверждение не для вас или уже устарело.",
      show_alert: false,
    });
    return;
  }

  if (
    parsed.ownerTelegramUserId !== undefined &&
    parsed.ownerTelegramUserId !== telegramUserId
  ) {
    await ctx.answerCallbackQuery({
      text: "Это подтверждение не для вас или уже устарело.",
      show_alert: false,
    });
    return;
  }

  const pending = getPendingConfirmation(telegramUserId);
  if (!pending) {
    await ctx.answerCallbackQuery({
      text: "Это действие уже обработано или устарело.",
      show_alert: false,
    });
    await removeInlineKeyboard(ctx);
    return;
  }

  if (
    parsed.confirmationId !== undefined &&
    pending.confirmationId !== parsed.confirmationId
  ) {
    await ctx.answerCallbackQuery({
      text: "Это действие уже обработано или устарело.",
      show_alert: false,
    });
    await removeInlineKeyboard(ctx);
    return;
  }

  await ctx.answerCallbackQuery();
  const result = await handleConfirmationDecision(ctx, telegramUserId, parsed.action);
  if (result.handled) {
    await removeInlineKeyboard(ctx);
  }
}
