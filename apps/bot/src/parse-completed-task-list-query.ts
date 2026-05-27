import { removeLeadingUserHintPrepositions } from "./resolve-users-by-hint";

export type CompletedTaskListQueryResult =
  | { type: "my" }
  | { type: "user"; userHint: string };

const MY_COMPLETED_TASKS_PATTERNS = [
  "мои выполненные задачи",
  "покажи мои выполненные задачи",
  "мои завершенные задачи",
  "покажи мои завершенные задачи",
  "что я завершил",
  "что я завершила",
  "что я закрыл",
  "что я закрыла",
] as const;

const SELF_USER_HINTS = new Set(["меня", "мне", "себя", "у меня"]);

const USER_COMPLETED_TASKS_PATTERNS: RegExp[] = [
  /^покажи(?: мне)?(?: список)? выполненные задачи (.+)$/,
  /^покажи(?: мне)?(?: список)? завершенные задачи (.+)$/,
  /^выполненные задачи (.+)$/,
  /^завершенные задачи (.+)$/,
  /^какие задачи закрыл[а]? (.+)$/,
  /^какие задачи завершил[а]? (.+)$/,
  /^какие задачи выполнил[а]? (.+)$/,
];

function normalizeForCompletedTaskListQuery(text: string): string {
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

export function parseCompletedTaskListQuery(text: string): CompletedTaskListQueryResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const normalized = normalizeForCompletedTaskListQuery(trimmed);

  for (const pattern of MY_COMPLETED_TASKS_PATTERNS) {
    if (normalized === pattern) {
      return { type: "my" };
    }
  }

  for (const regex of USER_COMPLETED_TASKS_PATTERNS) {
    const match = normalized.match(regex);
    if (!match?.[1]) continue;

    const captured = match[1].trim();
    if (!captured) continue;

    if (isSelfUserHint(captured)) {
      return { type: "my" };
    }

    let userHint = extractHintPreservingCase(trimmed, captured);
    userHint = removeLeadingUserHintPrepositions(userHint);
    if (!userHint) continue;

    return { type: "user", userHint };
  }

  return null;
}
