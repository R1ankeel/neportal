import type { Context } from "grammy";
import { getPendingConfirmation } from "./pending-intent";
import { buildConfirmationKeyboard } from "./telegram/keyboards/confirmation-keyboard";

export async function replyWithConfirmationPreview(
  ctx: Pick<Context, "reply">,
  telegramUserId: number,
  text: string,
): Promise<void> {
  const confirmationId = getPendingConfirmation(telegramUserId)?.confirmationId;
  await ctx.reply(text, {
    reply_markup: buildConfirmationKeyboard({
      ownerTelegramUserId: telegramUserId,
      confirmationId,
    }),
  });
}
