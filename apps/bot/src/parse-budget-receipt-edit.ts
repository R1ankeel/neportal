/** Разбор правки «чек да» / «нужен чек» в edit-mode create_budget. */

function normalizeReceiptEditText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

const RECEIPT_EDIT_TRUE: RegExp[] = [
  /^чек\s*[:：]?\s*да$/,
  /^чек\s+да$/,
  /^чек\s+(?:нужен|обязателен)$/,
  /^нужен\s+чек$/,
  /^обязателен\s+чек$/,
  /^отчетност\w*\s+обязательн\w*$/,
  /^требовать\s+чек$/,
  /^с\s+чеком$/,
  /^да\s+чек$/,
];

const RECEIPT_EDIT_FALSE: RegExp[] = [
  /^чек\s*[:：]?\s*нет$/,
  /^чек\s+нет$/,
  /^чек\s+не\s+(?:нужен|обязателен)$/,
  /^без\s+чека$/,
  /^отчетност\w*\s+не\s+обязательн\w*$/,
  /^не\s+требовать\s+чек$/,
  /^нет\s+чека$/,
];

/** true / false если распознана правка чека; null если не про чек. */
export function parseBudgetReceiptEdit(text: string): boolean | null {
  const t = normalizeReceiptEditText(text);
  if (!t) return null;

  if (RECEIPT_EDIT_FALSE.some((re) => re.test(t))) return false;
  if (RECEIPT_EDIT_TRUE.some((re) => re.test(t))) return true;

  return null;
}
