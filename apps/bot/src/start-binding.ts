import type { Context } from "grammy";
import { isConfirmationNo, isConfirmationYes } from "./confirmation";
import {
  fetchUserByTelegramUsername,
  linkTelegramUser,
  normalizeTelegramUsername,
} from "./api";
import {
  clearPendingConfirmation,
  setPendingConfirmation,
  type PendingLinkByUsername,
} from "./pending-intent";
import { buildStartLinkKeyboard } from "./telegram/keyboards/start-link-keyboard";
import { replyWithMainMenuAndPersistentButton } from "./main-menu-reply";
import type { StartLinkAction } from "./telegram/keyboards/start-link-keyboard";

export async function finalizeLinkSuccess(ctx: Context): Promise<void> {
  await replyWithMainMenuAndPersistentButton(
    ctx,
    [
      "Готово, Telegram привязан к Neportal.",
      "",
      "Теперь вы можете создавать задачи, записывать заметки,",
      "отчитываться по расходам и управлять задачами текстом или голосом.",
    ].join("\n"),
  );
}

export async function applyLinkByUsernameDecision(
  ctx: Context,
  pending: PendingLinkByUsername,
  decision: StartLinkAction,
  telegramUserId: number,
): Promise<void> {
  clearPendingConfirmation(telegramUserId);

  if (decision === "no") {
    await ctx.reply("Привязка отменена.");
    return;
  }

  try {
    await linkTelegramUser(pending.userId, String(telegramUserId));
    await finalizeLinkSuccess(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] link by username error: ${msg}`);
    await ctx.reply(`Ошибка API: ${msg}`);
  }
}

export async function handleStartBinding(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply("Не удалось определить Telegram ID.");
    return;
  }

  const rawUsername = ctx.from?.username;
  const username = rawUsername ? normalizeTelegramUsername(rawUsername) : null;

  try {
    if (username) {
      const user = await fetchUserByTelegramUsername(username);
      if (user) {
        if (user.telegramId) {
          await ctx.reply(
            "Этот username уже указан в профиле, но Telegram уже привязан. Обратитесь к руководителю.",
          );
          return;
        }

        const confirmationId = setPendingConfirmation(telegramId, {
          type: "confirm_link_by_username",
          userId: user.id,
          fullName: user.fullName,
          username,
        });

        await ctx.reply(
          `Привязать этот Telegram к корпоративному аккаунту ${user.fullName}?`,
          {
            reply_markup: buildStartLinkKeyboard({
              ownerTelegramUserId: telegramId,
              confirmationId,
            }),
          },
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
  pending: PendingLinkByUsername,
  text: string,
  telegramUserId: number,
): Promise<boolean> {
  if (isConfirmationYes(text)) {
    await applyLinkByUsernameDecision(ctx, pending, "yes", telegramUserId);
    return true;
  }

  if (isConfirmationNo(text)) {
    await applyLinkByUsernameDecision(ctx, pending, "no", telegramUserId);
    return true;
  }

  await ctx.reply("Ожидаю подтверждение привязки. Нажмите «Да» или «Нет», либо ответьте: да / нет");
  return true;
}
