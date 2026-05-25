import type { Context } from "grammy";
import { getActiveChoice } from "./choice-state";
import { buildChoiceKeyboard } from "./telegram/keyboards/choice-keyboard";

export async function replyWithActiveChoiceKeyboard(
  ctx: Pick<Context, "reply">,
  telegramUserId: number,
  text: string,
): Promise<void> {
  const choice = getActiveChoice(telegramUserId);
  if (!choice || choice.labels.length === 0) {
    await ctx.reply(text);
    return;
  }

  await ctx.reply(text, {
    reply_markup: buildChoiceKeyboard({
      ownerTelegramUserId: telegramUserId,
      choiceId: choice.choiceId,
      options: choice.labels,
    }),
  });
}
