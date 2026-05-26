import type { Context } from "grammy";
import { getPendingConfirmation } from "./pending-intent";
import {
  START_LINK_CALLBACK_PREFIX,
  parseStartLinkCallbackData,
} from "./telegram/keyboards/start-link-keyboard";
import { safeAnswerCallbackQuery } from "./telegram/safe-answer-callback";
import { safeEditMessageReplyMarkup } from "./telegram/safe-edit-message-reply-markup";
import { applyLinkByUsernameDecision } from "./start-binding";

export async function handleStartLinkCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith(`${START_LINK_CALLBACK_PREFIX}:`)) return false;

  const parsed = parseStartLinkCallbackData(data);
  const telegramUserId = ctx.from?.id;
  if (!parsed || !telegramUserId) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Это подтверждение не для вас или уже устарело.",
      show_alert: false,
    });
    return true;
  }

  if (parsed.ownerTelegramUserId !== telegramUserId) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Это подтверждение не для вас или уже устарело.",
      show_alert: false,
    });
    return true;
  }

  const pending = getPendingConfirmation(telegramUserId);
  if (
    !pending ||
    pending.type !== "confirm_link_by_username" ||
    pending.confirmationId !== parsed.confirmationId
  ) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Это подтверждение не для вас или уже устарело.",
      show_alert: false,
    });
    await safeEditMessageReplyMarkup(ctx, undefined);
    return true;
  }

  await safeAnswerCallbackQuery(ctx);
  await applyLinkByUsernameDecision(ctx, pending, parsed.action, telegramUserId);
  await safeEditMessageReplyMarkup(ctx, undefined);
  return true;
}
