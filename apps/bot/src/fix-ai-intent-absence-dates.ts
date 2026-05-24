import {
  addDaysToIsoDate,
  extractDeadlineFromRussianText,
  getWeekdayMentionDow,
  isIsoDateString,
  nextWeekdayFromIso,
  parseRuDate,
} from "./parse-ru-date";

function compareIso(a: string, b: string): number {
  return a.localeCompare(b);
}

function resolveDateFragment(
  fragment: string,
  baseDate: string,
  opts?: { notBefore?: string },
): string | undefined {
  const part = fragment.trim();
  if (!part) return undefined;

  const lower = part.toLowerCase();
  if (/^завтра$/u.test(lower)) return addDaysToIsoDate(baseDate, 1);
  if (/^послезавтра$/u.test(lower)) return addDaysToIsoDate(baseDate, 2);
  if (/^сегодня$/u.test(lower)) return baseDate;

  const dow = getWeekdayMentionDow(part);
  if (dow !== null) {
    const anchor = opts?.notBefore ?? baseDate;
    let date = nextWeekdayFromIso(anchor, dow);
    if (opts?.notBefore && compareIso(date, opts.notBefore) < 0) {
      date = addDaysToIsoDate(date, 7);
    }
    return date;
  }

  const ru = part.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
  if (ru) {
    const iso = parseRuDate(ru[1]);
    if (iso) return iso;
  }

  const isoInPart = part.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoInPart?.[1]) return isoInPart[1];

  const relative = extractDeadlineFromRussianText(part, baseDate);
  if (relative.deadlineDate) return relative.deadlineDate;

  return undefined;
}

/** «с завтра до понедельника», «с 01.06 по 10.06» и т.п. */
export function parseAbsencePeriodFromUserText(
  userText: string,
  baseDate: string,
): { startDate?: string; endDate?: string } {
  const trimmed = userText.trim();
  if (!trimmed) return {};

  const range = trimmed.match(
    /(?:^|\s)с\s+(.+?)\s+до\s+([\p{L}\d][\p{L}\d\s.,-]*?)(?=\s*(?:,|\.|$)|$)/iu,
  );
  if (range?.[1] && range[2]) {
    const startDate = resolveDateFragment(range[1], baseDate);
    const endDate = resolveDateFragment(range[2], baseDate, {
      notBefore: startDate,
    });
    return { startDate, endDate };
  }

  const untilOnly = trimmed.match(/(?:^|\s)до\s+([\p{L}\d][\p{L}\d\s.,-]*?)(?=\s*(?:,|\.|$)|$)/iu);
  if (untilOnly?.[1]) {
    const endDate = resolveDateFragment(untilOnly[1], baseDate);
    return { endDate };
  }

  const fromOnly = trimmed.match(/(?:^|\s)с\s+([\p{L}\d][\p{L}\d\s.,-]*?)(?=\s+до\s|,|\.|$)/iu);
  if (fromOnly?.[1]) {
    const startDate = resolveDateFragment(fromOnly[1], baseDate);
    return { startDate };
  }

  return {};
}

/** Подставляет/исправляет startDate/endDate create_absence по тексту пользователя. */
export function applyCreateAbsenceDateFix(
  payload: Record<string, unknown>,
  userText: string | undefined,
  baseDate: string,
): void {
  if (!userText?.trim()) return;

  const parsed = parseAbsencePeriodFromUserText(userText, baseDate);
  if (parsed.startDate) payload.startDate = parsed.startDate;
  if (parsed.endDate) payload.endDate = parsed.endDate;

  if (!parsed.endDate) return;
  const end = typeof payload.endDate === "string" ? payload.endDate : undefined;
  if (end && isIsoDateString(end) && end !== parsed.endDate) {
    payload.endDate = parsed.endDate;
  }
}
