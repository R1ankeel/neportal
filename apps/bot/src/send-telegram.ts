import type { Api } from "grammy";

/** Отправка личного сообщения по telegramId (числовой id пользователя в Telegram). */
export async function sendTelegramMessage(
  api: Api,
  telegramId: string,
  text: string,
): Promise<void> {
  await api.sendMessage(Number(telegramId), text);
}
