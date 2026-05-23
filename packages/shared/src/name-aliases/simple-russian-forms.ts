import { normalizeAliasToken } from "./normalize-name";

const NAME_SUFFIXES = ["а", "у", "ом", "е"] as const;

/** Простые падежные формы имени — fallback, если имени нет в словаре. */
export function simpleRussianNameForms(name: string): string[] {
  const base = normalizeAliasToken(name);
  if (!base || base.length < 2) return base ? [base] : [];

  const forms = new Set<string>([base]);
  if (base.length >= 3 && !/[аеёиоуыэюя]$/u.test(base)) {
    for (const suffix of NAME_SUFFIXES) {
      forms.add(base + suffix);
    }
  }
  return [...forms];
}

/** MVP-эвристики для русских фамилий. */
export function simpleRussianLastNameForms(lastName: string): string[] {
  const base = normalizeAliasToken(lastName);
  if (!base) return [];

  const forms = new Set<string>([base]);

  if (/(?:ов|ев|ин)$/u.test(base)) {
    forms.add(base + "а");
    forms.add(base + "у");
    forms.add(base + "ым");
    forms.add(base + "е");
  } else if (/(?:ова|ева|ина)$/u.test(base)) {
    forms.add(base.replace(/а$/u, "ой"));
    forms.add(base.replace(/а$/u, "у"));
  }

  return [...forms];
}
