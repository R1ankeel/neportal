import type { Api, InlineKeyboard } from "grammy";

/** Отправка личного сообщения по telegramId (числовой id пользователя в Telegram). */
export async function sendTelegramMessage(
  api: Api,
  telegramId: string,
  text: string,
  options?: { reply_markup?: InlineKeyboard },
): Promise<void> {
  await api.sendMessage(Number(telegramId), text, {
    reply_markup: options?.reply_markup,
  });
}
