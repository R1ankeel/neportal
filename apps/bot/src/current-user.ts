import { fetchUserByTelegramId, type ApiUser } from "./api";

export const NOT_LINKED_MESSAGE = "Вы не привязаны ни к какому проекту.";

export async function getLinkedUser(ctx: {
  from?: { id: number };
}): Promise<ApiUser | null> {
  if (ctx.from?.id == null) return null;
  return fetchUserByTelegramId(String(ctx.from.id));
}

export async function getLinkedUserByTelegramId(
  telegramUserId: number,
): Promise<ApiUser | null> {
  return fetchUserByTelegramId(String(telegramUserId));
}

/** Для рабочих команд: только привязанный user, иначе ответ и null. */
export async function requireLinkedUser(ctx: {
  from?: { id: number };
  reply: (text: string) => Promise<unknown>;
}): Promise<ApiUser | null> {
  const user = await getLinkedUser(ctx);
  if (!user) {
    await ctx.reply(NOT_LINKED_MESSAGE);
    return null;
  }
  return user;
}
