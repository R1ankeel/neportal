import {
  normalizeName,
  parseSystemAliasesString,
  splitUserName,
} from "@neportal/shared";
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

export { normalizeName, splitUserName } from "@neportal/shared";

const LEADING_USER_HINT_PREP_RE =
  /^(?:у|для|по|про|от|к|ко|на|с|со)\s+/iu;

/**
 * Убирает ведущий предлог из подсказки имени («у васи» → «васи»).
 */
export function removeLeadingUserHintPrepositions(hint: string): string {
  let s = hint.trim();
  if (!s) return s;

  let prev = "";
  while (s !== prev) {
    prev = s;
    const m = s.match(LEADING_USER_HINT_PREP_RE);
    if (m) {
      s = s.slice(m[0].length).trim();
    }
  }
  return s;
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

/** @deprecated Используйте normalizeName — оставлено для совместимости. */
export function normalizeUserHint(hint: string): string {
  return normalizeName(hint);
}

const SCORE_EXACT_USERNAME = 100;
const SCORE_EXACT_FULLNAME = 100;
const SCORE_EXACT_SYSTEM_ALIAS = 95;
const SCORE_ALIAS_AND_LASTNAME = 95;
const SCORE_TOKEN_STEM_ALL = 85;
const SCORE_SINGLE_ALIAS_STEM = 75;
const SCORE_FUZZY = 65;

function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i++;
  return i;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i++) matrix[i]![0] = i;
  for (let j = 0; j < cols; j++) matrix[0]![j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

function getUserAliases(user: ApiUser): string[] {
  const fromDb = parseSystemAliasesString(user.systemAliases);
  if (fromDb.length > 0) return fromDb;

  const { firstName, lastName } = splitUserName(user.fullName);
  const fallback: string[] = [];
  const first = firstName ? normalizeName(firstName) : "";
  const last = lastName ? normalizeName(lastName) : "";
  if (first) fallback.push(first);
  if (last) fallback.push(last);
  if (first && last) {
    fallback.push(`${first} ${last}`, `${last} ${first}`);
  }
  return fallback;
}

function aliasStemMatches(alias: string, hint: string): boolean {
  if (!alias || !hint) return false;
  if (alias === hint) return true;
  if (hint.startsWith(alias) && alias.length >= 3) return true;
  if (alias.startsWith(hint) && hint.length >= 3) return true;
  const prefix = commonPrefixLength(alias, hint);
  const minLen = Math.min(alias.length, hint.length);
  return prefix >= minLen - 1 && minLen >= 4;
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
  const aliases = getUserAliases(user);

  let score = 0;

  if (tg && tg === normalizedHint) score = Math.max(score, SCORE_EXACT_USERNAME);
  if (full === normalizedHint) score = Math.max(score, SCORE_EXACT_FULLNAME);

  if (first && last) {
    const firstLast = `${first} ${last}`;
    const lastFirst = `${last} ${first}`;
    if (firstLast === normalizedHint || lastFirst === normalizedHint) {
      score = Math.max(score, SCORE_EXACT_FULLNAME);
    }
  }

  for (const alias of aliases) {
    if (alias === normalizedHint) {
      score = Math.max(score, SCORE_EXACT_SYSTEM_ALIAS);
    }
  }

  if (isTwoWord && lastWord) {
    const hintFirst = firstWord;
    const hintLast = lastWord;
    const firstAliasHit = aliases.some((alias) => aliasStemMatches(alias, hintFirst));
    if (firstAliasHit && last && lastNameMatchesHint(last, hintLast)) {
      score = Math.max(score, SCORE_ALIAS_AND_LASTNAME);
    }
    if (first && aliasStemMatches(first, hintFirst) && last && lastNameMatchesHint(last, hintLast)) {
      score = Math.max(score, SCORE_ALIAS_AND_LASTNAME);
    }
  }

  const hintTokens = normalizedHint.split(/\s+/).filter(Boolean);
  if (hintTokens.length >= 1) {
    const allTokensMatch = hintTokens.every((token) =>
      aliases.some((alias) => aliasStemMatches(alias, token)),
    );
    if (allTokensMatch) score = Math.max(score, SCORE_TOKEN_STEM_ALL);
  }

  for (const alias of aliases) {
    if (aliasStemMatches(alias, normalizedHint) || aliasStemMatches(alias, firstWord)) {
      score = Math.max(score, SCORE_SINGLE_ALIAS_STEM);
    }
  }

  if (score === 0) {
    const fuzzyTargets = [full, ...aliases];
    if (tg) fuzzyTargets.push(tg);
    for (const target of fuzzyTargets) {
      if (target && levenshteinDistance(target, normalizedHint) <= 1) {
        score = Math.max(score, SCORE_FUZZY);
        break;
      }
    }
  }

  return score;
}

/**
 * Поиск сотрудников по подсказке: self, ФИО, username, systemAliases, stem/fuzzy.
 */
export function resolveUsersByHint(
  users: ApiUser[],
  hint: string,
  currentUser: ApiUser | null,
): UserNameMatchResult {
  const raw = removeLeadingUserHintPrepositions(hint?.trim() ?? "");
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
    const userScore = scoreUserMatch(user, normalizedHint, firstWord, lastWord, isTwoWord);
    if (userScore > 0) scored.push({ user, score: userScore });
  }

  if (scored.length === 0) return { kind: "none" };

  const maxScore = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === maxScore);

  if (top.length === 1) return { kind: "one", user: top[0].user };
  return { kind: "many", users: top.map((t) => t.user) };
}
