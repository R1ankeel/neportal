import type { ApiUser } from "@/lib/types";

export function getTelegramBindingStatus(user: ApiUser): {
  label: string;
  detail?: string;
} {
  if (user.telegramId) {
    return { label: "Привязан", detail: user.telegramId };
  }
  if (user.telegramUsername) {
    return { label: "Ожидает /start", detail: `@${user.telegramUsername}` };
  }
  return { label: "Username не указан" };
}
