import { SELF_HINT_MARKER } from "./resolve-users-by-hint";

/** Маркеры отсутствия от первого лица в исходном тексте create_absence. */
const CREATE_ABSENCE_SELF_MARKER_PATTERNS: RegExp[] = [
  /\bя\s+заболел[аи]?\b/iu,
  /\bу\s+меня\s+больничн/iu,
  /\bя\s+на\s+больничн/iu,
  /\bмне\s+поставили\s+больничн/iu,
  /\bя\s+ухожу\s+в\s+отпуск\b/iu,
  /\bя\s+в\s+отпуске\b/iu,
  /\bу\s+меня\s+отпуск\b/iu,
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
  if (process.env.BOT_DEV_LOG === "0") return;

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
