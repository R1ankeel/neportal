const PENDING_EXPENSES_PATTERNS = [
  "мои неподтвержденные расходы",
  "мои неподтверждённые расходы",
  "покажи расходы без чеков",
  "расходы без чеков",
  "какие чеки я должен загрузить",
  "где я не приложил чеки",
  "что у меня без чеков",
  "чеки к расходам",
] as const;

function normalizePendingExpensesQuery(text: string): string {
  let s = text.trim().toLowerCase();
  s = s.replace(/ё/g, "е");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[?!.]+\s*$/g, "").trim();
  return s;
}

/** Детерминированный разбор запроса списка неподтверждённых расходов (до YandexGPT). */
export function parsePendingExpensesQuery(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const normalized = normalizePendingExpensesQuery(trimmed);
  return PENDING_EXPENSES_PATTERNS.some((pattern) => normalized === pattern);
}
