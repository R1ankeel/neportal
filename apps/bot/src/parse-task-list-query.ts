export type TaskListQueryResult =
  | { type: "my" }
  | { type: "user"; userHint: string };

const MY_TASKS_PATTERNS = [
  "мои задачи",
  "покажи мои задачи",
  "что у меня по задачам",
  "какие у меня задачи",
  "что мне нужно сделать",
  "что мне делать",
  "что мне сделать",
  "задачи у меня",
] as const;

const SELF_USER_HINTS = new Set(["меня", "мне", "себя", "у меня"]);

const USER_TASKS_PATTERNS: RegExp[] = [
  /^какие(?: сейчас)? задачи у (.+)$/,
  /^что(?: сейчас)? у (.+) по задачам$/,
  /^покажи(?: список)? задач[и]? (.+)$/,
  /^список задач (.+)$/,
  /^задачи (.+)$/,
  /^чем занят[а]? (.+)$/,
  /^что делает (.+)$/,
];

function normalizeForTaskListQuery(text: string): string {
  let s = text.trim().toLowerCase();
  s = s.replace(/ё/g, "е");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[?!.]+\s*$/g, "").trim();
  return s;
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[?!.,;:]+$/g, "").trim();
}

function isSelfUserHint(hint: string): boolean {
  const n = hint.trim().toLowerCase().replace(/ё/g, "е");
  return SELF_USER_HINTS.has(n);
}

/** Сохраняет регистр/падеж из исходного текста. */
function extractHintPreservingCase(originalText: string, normalizedCapture: string): string {
  const needle = normalizedCapture.trim();
  if (!needle) return "";

  const origLower = originalText.toLowerCase().replace(/ё/g, "е");
  const needleLower = needle.replace(/ё/g, "е");
  const idx = origLower.indexOf(needleLower);
  if (idx >= 0) {
    return stripTrailingPunctuation(originalText.slice(idx, idx + needle.length));
  }
  return stripTrailingPunctuation(needle);
}

export function parseTaskListQuery(text: string): TaskListQueryResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const normalized = normalizeForTaskListQuery(trimmed);

  for (const pattern of MY_TASKS_PATTERNS) {
    if (normalized === pattern) {
      return { type: "my" };
    }
  }

  for (const regex of USER_TASKS_PATTERNS) {
    const match = normalized.match(regex);
    if (!match?.[1]) continue;

    const captured = match[1].trim();
    if (!captured) continue;

    if (isSelfUserHint(captured)) {
      return { type: "my" };
    }

    const userHint = extractHintPreservingCase(trimmed, captured);
    if (!userHint) continue;

    return { type: "user", userHint };
  }

  return null;
}
