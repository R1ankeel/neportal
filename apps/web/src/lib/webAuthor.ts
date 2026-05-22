import type { ApiUser } from "./types";

/** Web MVP: Иван Иванов OWNER из сида, иначе первый OWNER / первый пользователь. */
export function findWebAuthor(users: ApiUser[]): ApiUser | undefined {
  const ivan = users.find((u) => u.fullName === "Иван Иванов" && u.role === "OWNER");
  if (ivan) return ivan;
  return users.find((u) => u.role === "OWNER") ?? users[0];
}
