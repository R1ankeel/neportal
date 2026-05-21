import type { Context } from "grammy";
import { isConfirmationNo, isConfirmationYes } from "./confirmation";
import {
  fetchUserByTelegramId,
  fetchUserByTelegramUsername,
  linkTelegramUser,
  normalizeTelegramUsername,
} from "./api";
import {
  clearPendingConfirmation,
  setPendingConfirmation,
} from "./pending-intent";

export async function handleStartBinding(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  const telegramIdStr = String(telegramId);
  const rawUsername = ctx.from?.username;
  const username = rawUsername ? normalizeTelegramUsername(rawUsername) : null;

  try {
    const linked = await fetchUserByTelegramId(telegramIdStr);
    if (linked) {
      await ctx.reply(`Здравствуйте, ${linked.fullName}. Вы уже привязаны.`);
      return;
    }

    if (username) {
      const user = await fetchUserByTelegramUsername(username);
      if (user) {
        if (user.telegramId) {
          await ctx.reply(
            "Этот username уже указан в профиле, но Telegram уже привязан. Обратитесь к руководителю.",
          );
          return;
        }

        setPendingConfirmation(telegramId, {
          type: "confirm_link_by_username",
          userId: user.id,
          fullName: user.fullName,
          username,
        });

        await ctx.reply(
          [
            `Здравствуйте, ${user.fullName}.`,
            `Ваш Telegram @${username} указан в профиле Neportal.`,
            `Привязать этот Telegram к сотруднику ${user.fullName}?`,
            "Ответьте: да / нет",
          ].join("\n"),
        );
        return;
      }
    }

    await ctx.reply(
      "Ваш Telegram не найден в Neportal. Попросите руководителя добавить ваш username в карточку сотрудника.",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] start binding error: ${msg}`);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
}

export async function handleLinkByUsernameConfirmation(
  ctx: Context,
  pending: {
    type: "confirm_link_by_username";
    userId: string;
    fullName: string;
    username: string;
  },
  text: string,
  telegramUserId: number,
): Promise<boolean> {
  if (isConfirmationYes(text)) {
    clearPendingConfirmation(telegramUserId);
    try {
      const linked = await linkTelegramUser(
        pending.userId,
        String(telegramUserId),
      );
      await ctx.reply(
        `Готово. Telegram привязан к сотруднику: ${linked.fullName}.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] link by username error: ${msg}`);
      await ctx.reply(`Ошибка API: ${msg}`);
    }
    return true;
  }

  if (isConfirmationNo(text)) {
    clearPendingConfirmation(telegramUserId);
    await ctx.reply("Привязка отменена.");
    return true;
  }

  await ctx.reply("Ожидаю подтверждение привязки. Ответьте: да / нет");
  return true;
}
