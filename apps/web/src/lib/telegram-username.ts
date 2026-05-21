/** Согласовано с API `normalizeTelegramUsername`; пусто → null. */
export function normalizeTelegramUsername(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutAt = trimmed.replace(/^@+/, "");
  const lower = withoutAt.toLowerCase();
  return lower.length > 0 ? lower : null;
}
