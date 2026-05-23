import { SELF_HINT_MARKER } from "./resolve-users-by-hint";

const CANCEL_ABSENCE_SELF_MARKER_PATTERNS: RegExp[] = [
  /\bмой\s+больничн/iu,
  /\bмой\s+отпуск\b/iu,
  /\bмою\s+больничн/iu,
  /\bмо[йё]\s+отпуск\b/iu,
  /\bу\s+меня\s+больничн/iu,
  /\bу\s+меня\s+отпуск\b/iu,
  /\bотмени\s+мой\b/iu,
  /\bудали\s+мой\b/iu,
  /\bотменить\s+мой\b/iu,
  /\bудалить\s+мой\b/iu,
];

export function cancelAbsenceTextHasSelfUserMarker(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  return CANCEL_ABSENCE_SELF_MARKER_PATTERNS.some((re) => re.test(t));
}

export function applyCancelAbsenceUserSelfFix(
  payload: Record<string, unknown>,
  userText?: string,
): boolean {
  if (!userText?.trim()) return false;
  if (!cancelAbsenceTextHasSelfUserMarker(userText)) return false;
  payload.userHint = SELF_HINT_MARKER;
  return true;
}
