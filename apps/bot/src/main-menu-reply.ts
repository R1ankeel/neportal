import type { Context } from "grammy";
import { buildMainMenuKeyboard } from "./telegram/keyboards/main-menu-keyboard";

const DEFAULT_MENU_HEADER = "Выберите действие:";

export async function replyWithMainMenu(ctx: Context, header?: string): Promise<void> {
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  await ctx.reply(header ?? DEFAULT_MENU_HEADER, {
    reply_markup: buildMainMenuKeyboard(telegramUserId),
  });
}
