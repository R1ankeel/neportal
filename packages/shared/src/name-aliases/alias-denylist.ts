/** Запрещённые подстроки в alias — не сохраняем и не матчим. */
export const ALIAS_DENYLIST: readonly string[] = [
  "дурак",
  "дурачок",
  "идиот",
  "чурка",
  "хач",
  "хохол",
  "кацап",
  "жид",
  "негр",
  "пидор",
  "пидорас",
  "шлюха",
  "сука",
  "мразь",
];

export function isDeniedAlias(alias: string): boolean {
  const normalized = alias.trim().toLowerCase().replace(/ё/g, "е");
  if (!normalized) return true;
  return ALIAS_DENYLIST.some(
    (word) => normalized === word || normalized.includes(word),
  );
}
