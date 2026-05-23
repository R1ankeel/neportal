import type { ApiUser, UserNameMatchResult } from "./api";

export const SELF_HINT_MARKER = "__self__";

const SELF_HINT_WORDS = new Set([
  "мне",
  "меня",
  "мной",
  "на меня",
  "себе",
  "сам",
  "сама",
  "самому себе",
  SELF_HINT_MARKER,
]);

/** Каноническое имя → все формы (имя, уменьшительные, падежи). */
const NAME_ALIASES: Record<string, readonly string[]> = {
  василий: [
    "василий",
    "василия",
    "василию",
    "василием",
    "василии",
    "вася",
    "васе",
    "васю",
    "васи",
    "васей",
    "вась",
    "васька",
    "ваську",
  ],
  иван: [
    "иван",
    "ивана",
    "ивану",
    "иваном",
    "иване",
    "ваня",
    "ване",
    "ваню",
    "вани",
    "ваней",
    "ванька",
    "ваньку",
    "ванек",
    "ванёк",
  ],
  петр: [
    "петр",
    "пётр",
    "петра",
    "петру",
    "пете",
    "петей",
    "петя",
    "петю",
    "пети",
  ],
  мария: [
    "мария",
    "марию",
    "марии",
    "марией",
    "маша",
    "маше",
    "машу",
    "маши",
    "машей",
  ],
  александр: [
    "александр",
    "александра",
    "александру",
    "саша",
    "саше",
    "сашу",
    "саши",
    "саня",
    "сане",
    "саню",
  ],
  алексей: [
    "алексей",
    "алексея",
    "алексею",
    "леша",
    "лёша",
    "леше",
    "лёше",
    "лешу",
    "лёшу",
    "леши",
  ],
  дмитрий: [
    "дмитрий",
    "дмитрия",
    "дмитрию",
    "дима",
    "диме",
    "диму",
    "димы",
  ],
  михаил: [
    "михаил",
    "михаила",
    "михаилу",
    "миша",
    "мише",
    "мишу",
    "миши",
  ],
  екатерина: [
    "екатерина",
    "екатерину",
    "екатерине",
    "катя",
    "кате",
    "катю",
    "кати",
  ],
};

const ALIAS_TO_BASES = buildAliasToBasesMap();

function buildAliasToBasesMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [base, aliases] of Object.entries(NAME_ALIASES)) {
    const forms = new Set<string>([base, ...aliases]);
    for (const form of forms) {
      if (!map.has(form)) map.set(form, new Set());
      map.get(form)!.add(base);
    }
  }
  return map;
}

export function splitUserName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function normalizeName(value: string): string {
  let s = value.trim().toLowerCase();
  s = s.replace(/ё/g, "е");
  s = s.replace(/^@+/, "");
  s = s.replace(/^[«"'`„“]+|[»"'`„“]+$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[^\p{L}\p{N}@]+|[^\p{L}\p{N}]+$/gu, "");
  return s;
}

/** @deprecated Используйте normalizeName — оставлено для совместимости. */
export function normalizeUserHint(hint: string): string {
  return normalizeName(hint);
}

export function isSelfHint(hint: string): boolean {
  const normalized = normalizeName(hint);
  if (!normalized) return false;
  if (normalized === SELF_HINT_MARKER) return true;
  if (SELF_HINT_WORDS.has(normalized)) return true;
  for (const phrase of SELF_HINT_WORDS) {
    if (phrase.includes(" ") && (normalized === phrase || normalized.includes(phrase))) {
      return true;
    }
  }
  return false;
}

function getCanonicalBases(normalizedWord: string): string[] {
  if (!normalizedWord) return [];
  if (NAME_ALIASES[normalizedWord]) return [normalizedWord];
  const fromMap = ALIAS_TO_BASES.get(normalizedWord);
  if (fromMap && fromMap.size > 0) return [...fromMap];
  return [];
}

function namesShareAliasGroup(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const basesA = getCanonicalBases(a);
  const basesB = getCanonicalBases(b);
  const setA = new Set(basesA.length > 0 ? basesA : [a]);
  const setB = new Set(basesB.length > 0 ? basesB : [b]);
  for (const base of setA) {
    if (setB.has(base)) return true;
  }
  return false;
}

function firstNameMatchesHint(userFirst: string, hintFirst: string): boolean {
  if (!userFirst || !hintFirst) return false;
  if (userFirst === hintFirst) return true;
  return namesShareAliasGroup(userFirst, hintFirst);
}

function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i++;
  return i;
}

/** Сопоставление фамилии с падежной формой (пупкин ↔ пупкину). */
export function lastNameMatchesHint(lastName: string, hintLast: string): boolean {
  const ln = normalizeName(lastName);
  const hl = normalizeName(hintLast);
  if (!ln || !hl) return false;
  if (ln === hl) return true;
  if (ln.length >= 2 && hl.startsWith(ln.slice(0, -1))) return true;
  if (hl.length >= 2 && ln.startsWith(hl.slice(0, -1))) return true;
  return commonPrefixLength(ln, hl) >= 5;
}

const SCORE_EXACT_FULL_OR_USERNAME = 900;
const SCORE_FIRST_ALIAS_AND_LAST = 800;
const SCORE_FIRST_ALIAS = 700;
const SCORE_LAST_ONLY = 680;
const SCORE_INCLUDES_FULL = 600;
const SCORE_INCLUDES_USERNAME = 500;

function scoreUserMatch(
  user: ApiUser,
  normalizedHint: string,
  firstWord: string,
  lastWord: string | null,
  isTwoWord: boolean,
): number {
  const { firstName, lastName } = splitUserName(user.fullName);
  const full = normalizeName(user.fullName);
  const first = firstName ? normalizeName(firstName) : "";
  const last = lastName ? normalizeName(lastName) : "";
  const tg = user.telegramUsername
    ? normalizeName(user.telegramUsername.replace(/^@+/, ""))
    : "";

  if (isTwoWord && lastWord) {
    if (!first || !firstNameMatchesHint(first, firstWord)) return 0;
    if (last) {
      return lastNameMatchesHint(last, lastWord) ? SCORE_FIRST_ALIAS_AND_LAST : 0;
    }
    return SCORE_FIRST_ALIAS;
  }

  let score = 0;

  if (full === normalizedHint) score = Math.max(score, SCORE_EXACT_FULL_OR_USERNAME);
  if (tg && tg === normalizedHint) score = Math.max(score, SCORE_EXACT_FULL_OR_USERNAME);

  if (first && last) {
    const firstLast = `${first} ${last}`;
    const lastFirst = `${last} ${first}`;
    if (firstLast === normalizedHint || lastFirst === normalizedHint) {
      score = Math.max(score, SCORE_EXACT_FULL_OR_USERNAME);
    }
  }

  if (first && firstNameMatchesHint(first, firstWord)) {
    score = Math.max(score, SCORE_FIRST_ALIAS);
  }
  if (last && lastNameMatchesHint(last, normalizedHint)) {
    score = Math.max(score, SCORE_LAST_ONLY);
  }

  if (full.includes(normalizedHint) && normalizedHint.length >= 2) {
    score = Math.max(score, SCORE_INCLUDES_FULL);
  }
  if (tg && tg.includes(normalizedHint) && normalizedHint.length >= 2) {
    score = Math.max(score, SCORE_INCLUDES_USERNAME);
  }

  return score;
}

/**
 * Поиск сотрудников по подсказке: self, ФИО в падежах, username, уменьшительные имена.
 * При равном лучшем score возвращает всех кандидатов для User Selection Flow.
 */
export function resolveUsersByHint(
  users: ApiUser[],
  hint: string,
  currentUser: ApiUser | null,
): UserNameMatchResult {
  const raw = hint?.trim() ?? "";
  if (!raw) return { kind: "none" };

  if (raw === SELF_HINT_MARKER || isSelfHint(raw)) {
    if (!currentUser) return { kind: "none" };
    return { kind: "one", user: currentUser };
  }

  const normalizedHint = normalizeName(raw);
  if (!normalizedHint) return { kind: "none" };

  const words = normalizedHint.split(/\s+/).filter(Boolean);
  const isTwoWord = words.length >= 2;
  const firstWord = words[0] ?? normalizedHint;
  const lastWord = isTwoWord ? (words[words.length - 1] ?? null) : null;

  const scored: Array<{ user: ApiUser; score: number }> = [];
  for (const user of users) {
    const score = scoreUserMatch(user, normalizedHint, firstWord, lastWord, isTwoWord);
    if (score > 0) scored.push({ user, score });
  }

  if (scored.length === 0) return { kind: "none" };

  const maxScore = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === maxScore);

  if (top.length === 1) return { kind: "one", user: top[0].user };
  return { kind: "many", users: top.map((t) => t.user) };
}
