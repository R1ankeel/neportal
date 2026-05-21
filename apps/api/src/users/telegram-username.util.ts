/** Нормализация @username для хранения и поиска (без @, lower case). */
export function normalizeTelegramUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}
