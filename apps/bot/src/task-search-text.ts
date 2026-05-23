/** Нормализация и fuzzy-сопоставление названий задач. */

const PHRASE_REMOVALS = [
  /\bпо поводу\b/giu,
  /\bнасчет\b/giu,
  /\bнасчёт\b/giu,
] as const;

const SEARCH_STOP_WORDS = new Set([
  "задача",
  "задачу",
  "задачи",
  "по",
  "про",
  "поводу",
  "насчет",
  "насчёт",
  "в",
  "во",
  "на",
  "к",
  "ко",
  "с",
  "со",
  "у",
  "для",
  "о",
  "об",
  "от",
  "из",
  "и",
  "а",
  "но",
  "же",
  "ли",
  "бы",
]);

const WORD_CANONICAL: Record<string, string> = {
  поставщикам: "поставщик",
  поставщика: "поставщик",
  поставщики: "поставщик",
  поставщиков: "поставщик",
  подрядчикам: "подрядчик",
  подрядчика: "подрядчик",
  подрядчики: "подрядчик",
  подрядчиков: "подрядчик",
  документам: "документ",
  документа: "документ",
  документы: "документ",
  документов: "документ",
  складу: "склад",
  склада: "склад",
  складом: "склад",
  складе: "склад",
  офису: "офис",
  офиса: "офис",
  офисом: "офис",
  офисе: "офис",
  отчету: "отчет",
  отчёту: "отчет",
  отчета: "отчет",
  отчёта: "отчет",
  отчетом: "отчет",
  отчётом: "отчет",
  отчеты: "отчет",
  отчёты: "отчет",
};

const STEM_SUFFIXES = [
  "ами",
  "ями",
  "ах",
  "ях",
  "иями",
  "ого",
  "его",
  "ому",
  "ему",
  "ами",
  "ией",
  "ией",
  "ов",
  "ев",
  "ом",
  "ем",
  "ой",
  "ей",
  "ую",
  "юю",
  "ия",
  "ии",
  "ию",
  "ам",
  "ям",
  "иям",
  "ах",
  "ях",
  "а",
  "я",
  "у",
  "ю",
  "е",
  "и",
  "ы",
  "о",
] as const;

function simpleStem(word: string): string {
  if (word.length < 4) return word;
  for (const suffix of STEM_SUFFIXES) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

function canonicalToken(word: string): string {
  if (WORD_CANONICAL[word]) return WORD_CANONICAL[word];
  return simpleStem(word);
}

/** Нормализует текст для поиска задачи (без токенизации). */
export function normalizeTaskSearchText(text: string): string {
  let s = text.trim().toLowerCase().replace(/ё/g, "е");
  for (const re of PHRASE_REMOVALS) {
    s = s.replace(re, " ");
  }
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  const words = s.split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !SEARCH_STOP_WORDS.has(w));
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

function isMeaningfulToken(token: string): boolean {
  if (!token) return false;
  if (token.length >= 3) return !SEARCH_STOP_WORDS.has(token);
  return token.length >= 2 && /^\d+$/u.test(token);
}

/** Токены для сравнения (stem + stop-word filter). */
export function tokenizeForTaskMatch(text: string): string[] {
  const normalized = normalizeTaskSearchText(text);
  if (!normalized) return [];

  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of normalized.split(/\s+/)) {
    const token = canonicalToken(raw);
    if (!isMeaningfulToken(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

/**
 * Оценка совпадения query с title задачи (0–100).
 * exact=100, includes=90, all query tokens in title=85, >=70% tokens=70.
 */
export function scoreTaskTitleMatch(title: string, query: string): number {
  const normTitle = normalizeTaskSearchText(title);
  const normQuery = normalizeTaskSearchText(query);
  if (!normQuery) return 0;

  if (normTitle === normQuery) return 100;
  if (normTitle.includes(normQuery)) return 90;
  if (normQuery.includes(normTitle) && normTitle.length >= 4) return 88;

  const titleTokens = tokenizeForTaskMatch(title);
  const queryTokens = tokenizeForTaskMatch(query);
  if (queryTokens.length === 0) {
    return normTitle.includes(normQuery) ? 55 : 0;
  }

  const titleSet = new Set(titleTokens);
  const matched = queryTokens.filter((t) => titleSet.has(t));
  if (matched.length === 0) {
    const q = query.trim().toLowerCase();
    if (title.trim().toLowerCase().includes(q)) return 55;
    return 0;
  }

  const ratio = matched.length / queryTokens.length;
  if (matched.length === queryTokens.length) return 85;
  if (ratio >= 0.7) return 70;

  return Math.round(ratio * 55);
}

export const TASK_MATCH_MIN_SCORE = 60;
export const TASK_MATCH_CLEAR_WIN_SCORE = 80;
export const TASK_MATCH_SCORE_GAP = 10;
