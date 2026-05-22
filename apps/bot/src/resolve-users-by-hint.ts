import type { ApiUser, UserNameMatchResult } from "./api";

export const SELF_HINT_MARKER = "__self__";

const SELF_HINT_WORDS = new Set([
  "я",
  "мне",
  "меня",
  "мной",
  "себе",
  "на меня",
  "самому себе",
]);

/** Каноническое имя → уменьшительные и падежные формы (нормализованные). */
const NAME_ALIASES: Record<string, readonly string[]> = {
  иван: [
    "иван",
    "ваня",
    "ване",
    "ваню",
    "вани",
    "ванька",
    "ваньку",
    "ванек",
    "ванёк",
  ],
  александр: ["александр", "саша", "саше", "сашу", "сани", "саня"],
  алексей: ["алексей", "леша", "лёша", "леше", "лёше", "лешу", "лёшу"],
  дмитрий: ["дмитрий", "дима", "диме", "диму"],
  михаил: ["михаил", "миша", "мише", "мишу"],
  петр: ["петр", "пётр", "петя", "пете", "петю"],
  мария: ["мария", "маша", "маше", "машу"],
  екатерина: ["екатерина", "катя", "кате", "катю"],
};

export function splitUserName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function normalizeUserHint(hint: string): string {
  let s = hint.trim().toLowerCase();
  s = s.replace(/^@+/, "");
  s = s.replace(/ё/g, "е");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[^\p{L}\p{N}@]+|[^\p{L}\p{N}]+$/gu, "");
  return s;
}

export function isSelfHint(hint: string): boolean {
  const normalized = normalizeUserHint(hint);
  if (!normalized) return false;
  if (SELF_HINT_WORDS.has(normalized)) return true;
  for (const phrase of SELF_HINT_WORDS) {
    if (phrase.includes(" ")) {
      if (normalized === phrase || normalized.includes(phrase)) return true;
    }
  }
  return false;
}

function normalizeNamePart(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

function canonicalBasesForHint(normalizedHint: string): string[] {
  const bases: string[] = [];
  for (const [base, aliases] of Object.entries(NAME_ALIASES)) {
    if (aliases.includes(normalizedHint)) {
      bases.push(base);
    }
  }
  return bases;
}

function userMatchesHint(user: ApiUser, normalizedHint: string): boolean {
  const { firstName, lastName } = splitUserName(user.fullName);
  const full = normalizeNamePart(user.fullName);
  const first = normalizeNamePart(firstName);
  const last = lastName ? normalizeNamePart(lastName) : "";
  const tg = user.telegramUsername
    ? normalizeNamePart(user.telegramUsername.replace(/^@+/, ""))
    : "";

  if (full === normalizedHint || full.includes(normalizedHint)) return true;
  if (first && (first === normalizedHint || first.includes(normalizedHint))) return true;
  if (last && (last === normalizedHint || last.includes(normalizedHint))) return true;
  if (tg && tg.includes(normalizedHint)) return true;

  const aliasBases = canonicalBasesForHint(normalizedHint);
  if (aliasBases.length > 0 && first) {
    if (aliasBases.some((base) => first === base || first.startsWith(base))) {
      return true;
    }
  }

  return false;
}

/**
 * Поиск сотрудников по подсказке: self, ФИО, username, уменьшительные имена.
 * Не выбирает автоматически при нескольких совпадениях.
 */
export function resolveUsersByHint(
  users: ApiUser[],
  hint: string,
  currentUser: ApiUser | null,
): UserNameMatchResult {
  const raw = hint.trim();
  if (!raw) return { kind: "none" };

  if (raw === SELF_HINT_MARKER || isSelfHint(raw)) {
    if (!currentUser) return { kind: "none" };
    return { kind: "one", user: currentUser };
  }

  const normalizedHint = normalizeUserHint(raw);
  if (!normalizedHint) return { kind: "none" };

  const matches = users.filter((u) => userMatchesHint(u, normalizedHint));
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "one", user: matches[0] };
  return { kind: "many", users: matches };
}
