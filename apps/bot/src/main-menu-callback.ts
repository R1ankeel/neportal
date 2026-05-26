import type { Context } from "grammy";
import { requireLinkedUser } from "./current-user";
import { replyWithTasksForHint } from "./my-tasks-flow";
import { showPendingExpenses } from "./pending-expenses-flow";
import { replyWithMainMenu } from "./main-menu-reply";
import {
  MAIN_MENU_CALLBACK_PREFIX,
  parseMainMenuCallbackData,
} from "./telegram/keyboards/main-menu-keyboard";
import { safeAnswerCallbackQuery } from "./telegram/safe-answer-callback";

const INFO_TEXT = [
  "Вы можете писать обычным текстом или отправлять голосовые сообщения — бот распознаёт речь и выполняет задачу.",
  "",
  "Например:",
  "• «Создай Маше задачу на завтра подготовить отчёт»",
  "• «Потратил 1500 на рекламу»",
  "• «Покажи мои задачи»",
  "",
  "Slash-команды (/task, /note, /expense и др.) тоже работают — см. /demo.",
].join("\n");

export async function handleMainMenuCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith(`${MAIN_MENU_CALLBACK_PREFIX}:`)) return false;

  const parsed = parseMainMenuCallbackData(data);
  const telegramUserId = ctx.from?.id;
  if (!parsed || !telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: "Неизвестная команда.", show_alert: false });
    return true;
  }

  if (parsed.ownerTelegramUserId !== telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: "Неизвестная команда.", show_alert: false });
    return true;
  }

  await safeAnswerCallbackQuery(ctx);

  switch (parsed.action) {
    case "my-tasks": {
      const user = await requireLinkedUser(ctx);
      if (!user) return true;
      try {
        await replyWithTasksForHint(ctx, user, telegramUserId, "", 5);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[bot] main menu my-tasks error: ${msg}`);
        await ctx.reply(`Ошибка API: ${msg}`);
      }
      return true;
    }
    case "create-task":
      await ctx.reply(
        "Напишите или скажите голосом, какую задачу создать.\nНапример: «Создай Маше задачу на завтра подготовить отчёт».",
      );
      return true;
    case "create-note":
      await ctx.reply(
        "Напишите или скажите голосом текст заметки.\nНапример: «Запиши заметку: купить рыбу на корпоратив».",
      );
      return true;
    case "create-expense":
      await ctx.reply(
        "Напишите расход текстом или голосом.\nНапример: «Потратил 1500 на рекламу».\nЧек можно прикрепить файлом или фото после создания расхода.",
      );
      return true;
    case "unconfirmed-expenses": {
      const linked = await requireLinkedUser(ctx);
      if (!linked) return true;
      try {
        await showPendingExpenses(ctx, linked, telegramUserId, 10);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[bot] main menu unconfirmed-expenses error: ${msg}`);
        await ctx.reply(`Ошибка API: ${msg}`);
      }
      return true;
    }
    case "sick":
      await ctx.reply(
        "Напишите или скажите период больничного.\nНапример: «Больничный до 30.05.2026».",
      );
      return true;
    case "vacation":
      await ctx.reply(
        "Напишите или скажите период отпуска.\nНапример: «Отпуск с 01.06.2026 по 10.06.2026».",
      );
      return true;
    case "info":
      await ctx.reply(INFO_TEXT);
      await replyWithMainMenu(ctx);
      return true;
  }
}
