import type { Context } from "grammy";
import { buildMainMenuKeyboard } from "./telegram/keyboards/main-menu-keyboard";
import { buildPersistentMenuKeyboard } from "./telegram/keyboards/persistent-menu-keyboard";

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

/**
 * Отправляет сообщение с постоянной reply keyboard (кнопка «Главное меню»),
 * затем показывает inline-меню. Вызывается при первом входе или привязке.
 */
export async function replyWithMainMenuAndPersistentButton(
  ctx: Context,
  greeting: string,
): Promise<void> {
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  await ctx.reply(greeting, {
    reply_markup: buildPersistentMenuKeyboard(),
  });

  await ctx.reply(DEFAULT_MENU_HEADER, {
    reply_markup: buildMainMenuKeyboard(telegramUserId),
  });
}
