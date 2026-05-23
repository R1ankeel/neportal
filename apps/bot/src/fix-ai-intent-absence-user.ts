import { SELF_HINT_MARKER } from "./resolve-users-by-hint";

/** JS `\b` не учитывает кириллицу — граница слова через Unicode properties. */
const WB_START = "(?<![\\p{L}\\p{N}_])";
const WB_END = "(?![\\p{L}\\p{N}_])";

/** Маркеры отсутствия от первого лица в исходном тексте create_absence. */
const CREATE_ABSENCE_SELF_MARKER_PATTERNS: RegExp[] = [
  new RegExp(`${WB_START}я\\s+заболел[аи]?${WB_END}`, "iu"),
  new RegExp(`${WB_START}у\\s+меня\\s+больничн`, "iu"),
  new RegExp(`${WB_START}я\\s+на\\s+больничн`, "iu"),
  new RegExp(`${WB_START}мне\\s+поставили\\s+больничн`, "iu"),
  new RegExp(`${WB_START}я\\s+ухожу\\s+в\\s+отпуск${WB_END}`, "iu"),
  new RegExp(`${WB_START}я\\s+в\\s+отпуске${WB_END}`, "iu"),
  new RegExp(`${WB_START}у\\s+меня\\s+отпуск${WB_END}`, "iu"),
];

export function createAbsenceTextHasSelfUserMarker(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  return CREATE_ABSENCE_SELF_MARKER_PATTERNS.some((re) => re.test(t));
}

/**
 * Если в тексте есть first-person absence marker — userHint = "__self__".
 */
export function applyCreateAbsenceUserSelfFix(
  payload: Record<string, unknown>,
  userText?: string,
): boolean {
  if (!userText?.trim()) return false;
  if (!createAbsenceTextHasSelfUserMarker(userText)) return false;
  payload.userHint = SELF_HINT_MARKER;
  return true;
}

const PLACEHOLDER_HINTS = new Set(["null", "undefined", "none", "nil", ""]);

/** Пустые / placeholder подсказки → undefined (использовать current user). */
export function sanitizeAiUserHint(
  hint: string | null | undefined,
): string | undefined {
  if (hint == null) return undefined;
  const t = hint.trim();
  if (!t || PLACEHOLDER_HINTS.has(t.toLowerCase())) return undefined;
  return t;
}

/** Нужно искать другого сотрудника по имени (не self и не пусто). */
export function isResolvableNamedUserHint(hint: string | undefined): hint is string {
  if (!hint) return false;
  if (hint === SELF_HINT_MARKER) return false;
  return true;
}

export function devLogCreateAbsenceUserSelfChecks(): void {
  const cases = [
    { text: "Я заболел. Больничный до 25.05.2026", wrong: "Вася" },
    { text: "У меня больничный до 25.05.2026", wrong: null },
  ];

  for (const { text, wrong } of cases) {
    const payload: Record<string, unknown> = { userHint: wrong, type: "SICK_LEAVE" };
    const changed = applyCreateAbsenceUserSelfFix(payload, text);
    const ok = changed && payload.userHint === SELF_HINT_MARKER;
    console.log(`[fix-ai-intent-absence-user] self user ${ok ? "OK" : "FAIL"}`, {
      text,
      got: payload.userHint,
    });
  }
}
