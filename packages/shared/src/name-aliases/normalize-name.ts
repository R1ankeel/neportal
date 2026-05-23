export function normalizeAliasToken(value: string): string {
  let s = value.trim().toLowerCase();
  s = s.replace(/ё/g, "е");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Нормализация подсказки имени / username из текста пользователя. */
export function normalizeName(value: string): string {
  let s = value.trim().toLowerCase();
  s = s.replace(/ё/g, "е");
  s = s.replace(/^@+/, "");
  s = s.replace(/^[«"'`„“]+|[»"'`„“]+$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[^\p{L}\p{N}@]+|[^\p{L}\p{N}]+$/gu, "");
  return s;
}

export function splitUserName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
