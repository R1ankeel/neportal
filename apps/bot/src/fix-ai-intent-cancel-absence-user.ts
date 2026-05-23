import { SELF_HINT_MARKER } from "./resolve-users-by-hint";

const WB_START = "(?<![\\p{L}\\p{N}_])";
const WB_END = "(?![\\p{L}\\p{N}_])";

const CANCEL_ABSENCE_SELF_MARKER_PATTERNS: RegExp[] = [
  new RegExp(`${WB_START}мой\\s+больничн`, "iu"),
  new RegExp(`${WB_START}мой\\s+отпуск${WB_END}`, "iu"),
  new RegExp(`${WB_START}мою\\s+больничн`, "iu"),
  new RegExp(`${WB_START}мо[йё]\\s+отпуск${WB_END}`, "iu"),
  new RegExp(`${WB_START}у\\s+меня\\s+больничн`, "iu"),
  new RegExp(`${WB_START}у\\s+меня\\s+отпуск${WB_END}`, "iu"),
  new RegExp(`${WB_START}отмени\\s+мой${WB_END}`, "iu"),
  new RegExp(`${WB_START}удали\\s+мой${WB_END}`, "iu"),
  new RegExp(`${WB_START}отменить\\s+мой${WB_END}`, "iu"),
  new RegExp(`${WB_START}удалить\\s+мой${WB_END}`, "iu"),
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
