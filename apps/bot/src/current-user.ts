import {
  fetchUserByTelegramId,
  fetchUsers,
  type ApiUser,
} from "./api";

/** Linked Telegram user, else Иван Иванов OWNER, else first user. */
export async function getCurrentUserOrFallback(ctx: {
  from?: { id: number };
}): Promise<ApiUser | undefined> {
  if (ctx.from?.id != null) {
    const linked = await fetchUserByTelegramId(String(ctx.from.id));
    if (linked) return linked;
  }

  const users = await fetchUsers();
  const ivan = users.find(
    (u) => u.fullName.includes("Иван") && u.role === "OWNER",
  );
  if (ivan) return ivan;
  return users[0];
}

export async function getCurrentUserOrFallbackByTelegramId(
  telegramUserId?: number,
): Promise<ApiUser | undefined> {
  if (telegramUserId != null) {
    const linked = await fetchUserByTelegramId(String(telegramUserId));
    if (linked) return linked;
  }

  const users = await fetchUsers();
  const ivan = users.find(
    (u) => u.fullName.includes("Иван") && u.role === "OWNER",
  );
  if (ivan) return ivan;
  return users[0];
}
