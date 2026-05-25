import type { Context } from "grammy";
import { handleConfirmationDecision } from "./confirmation-decision";
import { getPendingConfirmation } from "./pending-intent";
import { parseConfirmationCallbackData } from "./telegram/keyboards/confirmation-keyboard";
import { safeAnswerCallbackQuery } from "./telegram/safe-answer-callback";
import { safeEditMessageReplyMarkup } from "./telegram/safe-edit-message-reply-markup";

async function removeInlineKeyboard(ctx: Context): Promise<void> {
  await safeEditMessageReplyMarkup(ctx, undefined);
}

export async function handleConfirmationCallback(ctx: Context): Promise<void> {
  const parsed = parseConfirmationCallbackData(ctx.callbackQuery?.data);
  if (!parsed) return;

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Это подтверждение не для вас или уже устарело.",
      show_alert: false,
    });
    return;
  }

  if (
    parsed.ownerTelegramUserId !== undefined &&
    parsed.ownerTelegramUserId !== telegramUserId
  ) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Это подтверждение не для вас или уже устарело.",
      show_alert: false,
    });
    return;
  }

  const pending = getPendingConfirmation(telegramUserId);
  if (!pending) {
    await safeAnswerCallbackQuery(ctx, {
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
    await safeAnswerCallbackQuery(ctx, {
      text: "Это действие уже обработано или устарело.",
      show_alert: false,
    });
    await removeInlineKeyboard(ctx);
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  const result = await handleConfirmationDecision(ctx, telegramUserId, parsed.action);
  if (result.handled) {
    await removeInlineKeyboard(ctx);
  }
}
