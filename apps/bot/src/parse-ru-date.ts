/** Парсит DD.MM.YYYY → ISO date YYYY-MM-DD или null. */
export function parseRuDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Сегодня в UTC как YYYY-MM-DD. */
export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDateString(value: string): boolean {
  return ISO_DATE_ONLY_RE.test(value.trim());
}

/** Сдвиг ISO date YYYY-MM-DD на N календарных дней (UTC). */
export function addDaysToIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Сдвиг ISO date YYYY-MM-DD на N календарных месяцев (UTC, с переносом дня). */
export function addMonthsToIsoDate(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Первое число следующего календарного месяца относительно baseDate. */
export function firstDayOfNextCalendarMonth(baseIso: string): string {
  const [y, m] = baseIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m, 1));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** N-е число следующего календарного месяца относительно baseDate. */
export function nthDayOfNextCalendarMonth(baseIso: string, day: number): string {
  const first = firstDayOfNextCalendarMonth(baseIso);
  const [y, m] = first.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, day));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const NEXT_CALENDAR_MONTH_RE =
  /(?:в\s+)?следующ(?:ем|ий)\s+месяц(?:е)?|следующ(?:ий|ем)\s+месяц(?:е)?/iu;
const THROUGH_ONE_MONTH_RE = /через\s+месяц/iu;
const NEXT_MONTH_DAY_RE =
  /(?:в\s+)?следующ(?:ем|ий)\s+месяц(?:е)?.*?(?:до\s+)?(\d{1,2})\s*числ/iu;

function extractMonthRelativeDeadline(
  text: string,
  baseDate: string,
): { deadlineDate: string | null } {
  const lower = text.toLowerCase();

  if (THROUGH_ONE_MONTH_RE.test(lower) && !NEXT_CALENDAR_MONTH_RE.test(lower)) {
    return { deadlineDate: addMonthsToIsoDate(baseDate, 1) };
  }

  const dayInNextMonth = text.match(NEXT_MONTH_DAY_RE);
  if (dayInNextMonth) {
    const day = Number(dayInNextMonth[1]);
    if (day >= 1 && day <= 31) {
      return { deadlineDate: nthDayOfNextCalendarMonth(baseDate, day) };
    }
  }

  if (NEXT_CALENDAR_MONTH_RE.test(lower)) {
    return { deadlineDate: firstDayOfNextCalendarMonth(baseDate) };
  }

  return { deadlineDate: null };
}

/** «В следующем месяце» ошибочно как +1 месяц от текущего дня → 1-е число след. месяца. */
export function correctNextCalendarMonthMisparse(
  userText: string,
  baseDate: string,
  deadlineDate: string | undefined,
): string | undefined {
  if (!deadlineDate) return deadlineDate;
  const lower = userText.toLowerCase();
  if (!NEXT_CALENDAR_MONTH_RE.test(lower) || THROUGH_ONE_MONTH_RE.test(lower)) {
    return deadlineDate;
  }

  const dayMatch = userText.match(NEXT_MONTH_DAY_RE);
  if (dayMatch) {
    const day = Number(dayMatch[1]);
    if (day >= 1 && day <= 31) {
      return nthDayOfNextCalendarMonth(baseDate, day);
    }
  }

  const expectedFirst = firstDayOfNextCalendarMonth(baseDate);
  const oneMonthLaterSameDay = addMonthsToIsoDate(baseDate, 1);
  if (deadlineDate === oneMonthLaterSameDay && deadlineDate !== expectedFirst) {
    return expectedFirst;
  }

  return deadlineDate;
}

/** Ближайший указанный день недели (0=вс … 6=сб), не раньше baseDate. */
export function nextWeekdayFromIso(baseIso: string, targetDow: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const currentDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  let days = targetDow - currentDow;
  if (days < 0) days += 7;
  return addDaysToIsoDate(baseIso, days);
}

/** Без \\b — в JS word boundary не работает с кириллицей. */
const WEEKDAY_PATTERNS: ReadonlyArray<{ pattern: RegExp; dow: number }> = [
  { pattern: /воскресенье/iu, dow: 0 },
  { pattern: /понедельник/iu, dow: 1 },
  { pattern: /вторник/iu, dow: 2 },
  { pattern: /сред[аы]?/iu, dow: 3 },
  { pattern: /четверг/iu, dow: 4 },
  { pattern: /пятниц/iu, dow: 5 },
  { pattern: /суббот/iu, dow: 6 },
];

/** День недели из текста (0=вс … 6=сб) или null. */
export function getWeekdayMentionDow(text: string): number | null {
  const lower = text.toLowerCase();
  for (const { pattern, dow } of WEEKDAY_PATTERNS) {
    if (pattern.test(lower)) return dow;
  }
  return null;
}

function extractWeekdayFromText(text: string, baseDate: string): string | null {
  const dow = getWeekdayMentionDow(text);
  if (dow === null) return null;
  return nextWeekdayFromIso(baseDate, dow);
}

export type OrdinalWeekdayNextMonthMatch = {
  deadlineDate: string;
  matchedText: string;
  matchedStart: number;
  matchedEnd: number;
  source: "ordinal-weekday-next-month";
};

const ORDINAL_NEXT_MONTH_FRAGMENT =
  "(?:следующ(?:его|ем)\\s+месяца|в\\s+следующем\\s+месяце|следующем\\s+месяце)";

const ORDINAL_ORDINAL_FRAGMENT =
  "(?:перв(?:ый|ая|ое|ую|ого)|втор(?:ой|ая|ую|ого)|трет(?:ий|ья|ью|ьего)|четверт(?:ый|ая|ую|ого)|четвёрт(?:ый|ая|ую|ого)|последн(?:ий|яя|юю|нюю|его))";

const ORDINAL_WEEKDAY_FRAGMENT =
  "(?:понедельник(?:а|у|е)?|вторник(?:а|у|е)?|сред(?:а|у|ы|е)?|четверг(?:а|у|е)?|пятниц(?:а|у|ы|е)?|суббот(?:а|у|ы|е)?|воскресень(?:е|я|ю)?)";

const ORDINAL_OPTIONAL_PREP = "(?:(?:на|к|ко|до|в)\\s+)?";

const ORDINAL_STANDARD_ORDER_RE = new RegExp(
  `${ORDINAL_OPTIONAL_PREP}(${ORDINAL_ORDINAL_FRAGMENT})\\s+(${ORDINAL_WEEKDAY_FRAGMENT})\\s+${ORDINAL_NEXT_MONTH_FRAGMENT}`,
  "giu",
);

const ORDINAL_REVERSED_ORDER_RE = new RegExp(
  `(?:в\\s+)?${ORDINAL_NEXT_MONTH_FRAGMENT}\\s+${ORDINAL_OPTIONAL_PREP}(${ORDINAL_ORDINAL_FRAGMENT})\\s+(${ORDINAL_WEEKDAY_FRAGMENT})`,
  "giu",
);

type OrdinalWeekdayKind = 1 | 2 | 3 | 4 | "last";

function parseOrdinalWeekdayKind(fragment: string): OrdinalWeekdayKind | null {
  const lower = fragment.toLowerCase().replace(/ё/g, "е");
  if (/^перв/u.test(lower)) return 1;
  if (/^втор/u.test(lower)) return 2;
  if (/^трет/u.test(lower)) return 3;
  if (/^четверт/u.test(lower)) return 4;
  if (/^последн/u.test(lower)) return "last";
  return null;
}

function lastDayOfCalendarMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** N-й (или последний) weekday в следующем календарном месяце относительно baseDate. */
export function resolveOrdinalWeekdayInNextMonth(
  baseDate: string,
  targetDow: number,
  ordinal: OrdinalWeekdayKind,
): string | null {
  const monthStart = firstDayOfNextCalendarMonth(baseDate);
  const [y, m] = monthStart.split("-").map(Number);
  const monthIndex = m - 1;
  const daysInMonth = lastDayOfCalendarMonth(y, m);

  let firstDowDay = 1;
  while (firstDowDay <= daysInMonth) {
    const dow = new Date(Date.UTC(y, monthIndex, firstDowDay)).getUTCDay();
    if (dow === targetDow) break;
    firstDowDay++;
  }
  if (firstDowDay > daysInMonth) return null;

  if (ordinal === "last") {
    let last = firstDowDay;
    let candidate = firstDowDay + 7;
    while (candidate <= daysInMonth) {
      last = candidate;
      candidate += 7;
    }
    const mm = String(m).padStart(2, "0");
    const dd = String(last).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }

  const targetDay = firstDowDay + 7 * (ordinal - 1);
  if (targetDay > daysInMonth) return null;

  const mm = String(m).padStart(2, "0");
  const dd = String(targetDay).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function tryExtractOrdinalWeekdayMatch(
  text: string,
  baseDate: string,
  pattern: RegExp,
): OrdinalWeekdayNextMonthMatch | null {
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  if (!match) return null;

  const matchedText = match[0];
  const ordinalFragment = match[1] ?? "";
  const weekdayFragment = match[2] ?? "";
  const ordinal = parseOrdinalWeekdayKind(ordinalFragment);
  const dow = getWeekdayMentionDow(weekdayFragment);
  if (ordinal === null || dow === null) return null;

  const deadlineDate = resolveOrdinalWeekdayInNextMonth(baseDate, dow, ordinal);
  if (!deadlineDate) return null;

  return {
    deadlineDate,
    matchedText,
    matchedStart: match.index,
    matchedEnd: match.index + matchedText.length,
    source: "ordinal-weekday-next-month",
  };
}

/** «На первую пятницу следующего месяца» и перестановки слов. */
export function extractOrdinalWeekdayNextMonth(
  text: string,
  baseDate: string,
): OrdinalWeekdayNextMonthMatch | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const standard = tryExtractOrdinalWeekdayMatch(trimmed, baseDate, ORDINAL_STANDARD_ORDER_RE);
  if (standard) return standard;

  return tryExtractOrdinalWeekdayMatch(trimmed, baseDate, ORDINAL_REVERSED_ORDER_RE);
}

/** Есть ли в тексте явная отсылка к сроку (день недели, завтра, дата). */
export function hasRussianDateHint(text: string): boolean {
  const lower = text.toLowerCase();
  if (/послезавтра|завтра|сегодня/u.test(lower)) return true;
  if (THROUGH_ONE_MONTH_RE.test(lower) || NEXT_CALENDAR_MONTH_RE.test(lower)) return true;
  if (getWeekdayMentionDow(text) !== null) return true;
  if (/(?:до|к|на|в)\s+\d{1,2}\.\d{1,2}\.\d{4}/iu.test(text)) return true;
  if (/\d{4}-\d{2}-\d{2}/.test(text) || /\d{1,2}\.\d{1,2}\.\d{4}/.test(text)) return true;
  return false;
}

/** Дедлайн из сообщения пользователя; ordinal+след. месяц важнее ближайшего weekday. */
export function resolveDeadlineFromUserMessage(
  userText: string,
  baseDate: string = todayIsoDate(),
): string | null {
  const trimmed = userText.trim();
  if (!trimmed) return null;

  const ordinal = extractOrdinalWeekdayNextMonth(trimmed, baseDate);
  if (ordinal) return ordinal.deadlineDate;

  const dow = getWeekdayMentionDow(trimmed);
  if (dow !== null) return nextWeekdayFromIso(baseDate, dow);

  return extractDeadlineFromRussianText(trimmed, baseDate).deadlineDate;
}

/**
 * Приводит deadlineDate к YYYY-MM-DD: ISO, плейсхолдеры модели, дни недели, «завтра».
 */
export function coerceDeadlineDateLoose(
  raw: string,
  baseDate: string = todayIsoDate(),
): string | undefined {
  const trimmed = raw.trim().replace(/^<+|>+$/g, "").trim();
  if (!trimmed) return undefined;
  if (isIsoDateString(trimmed)) return trimmed;

  const baseHint = trimmed.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? baseDate;

  const weekday = extractWeekdayFromText(trimmed, baseHint);
  if (weekday) return weekday;

  const relative = extractDeadlineFromRussianText(trimmed, baseHint);
  if (relative.deadlineDate) return relative.deadlineDate;

  const ruMatch = trimmed.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
  if (ruMatch) {
    const iso = parseRuDate(ruMatch[1]);
    if (iso) return iso;
  }

  return undefined;
}

/** Извлекает дедлайн из русского текста относительно baseDate (YYYY-MM-DD). */
export function extractDeadlineFromRussianText(
  text: string,
  baseDate: string = todayIsoDate(),
): { deadlineDate: string | null } {
  const lower = text.toLowerCase();

  const weekday = extractWeekdayFromText(text, baseDate);
  if (weekday) return { deadlineDate: weekday };

  const monthRelative = extractMonthRelativeDeadline(text, baseDate);
  if (monthRelative.deadlineDate) return monthRelative;

  if (/послезавтра/u.test(lower)) {
    return { deadlineDate: addDaysToIsoDate(baseDate, 2) };
  }
  if (/завтра/u.test(lower)) {
    return { deadlineDate: addDaysToIsoDate(baseDate, 1) };
  }
  if (/сегодня/u.test(lower)) {
    return { deadlineDate: baseDate };
  }

  const absMatch = text.match(/(?:до|к|на|в)\s+(\d{1,2}\.\d{1,2}\.\d{4})/iu);
  if (absMatch) {
    const iso = parseRuDate(absMatch[1]);
    if (iso) return { deadlineDate: iso };
  }

  const isoInText = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoInText) return { deadlineDate: isoInText[1] };

  return { deadlineDate: null };
}

const RELATIVE_DATE_KEYWORDS = /^(?:сегодня|завтра|послезавтра)$/iu;

/** Одно слово — относительная дата (не имя исполнителя). */
export function isRelativeDeadlineKeyword(word: string): boolean {
  const w = word.trim().toLowerCase().replace(/ё/g, "е");
  if (!w) return false;
  if (RELATIVE_DATE_KEYWORDS.test(w)) return true;
  return getWeekdayMentionDow(w) !== null;
}

const DEADLINE_PREP_BOUNDARY = "(?:^|[\\s,.!?;:—-])";
const DEADLINE_PREP_END = "(?=$|[\\s,.!?;:—-])";

/** «на сегодня», «к завтра», «до понедельника» и т.п. */
function stripPrepositionalDeadlinePhrases(s: string): string {
  let out = s;
  out = out.replace(
    new RegExp(
      `${DEADLINE_PREP_BOUNDARY}(?:на|к|до|в)\\s+(?:сегодня|завтра|послезавтра)${DEADLINE_PREP_END}`,
      "giu",
    ),
    " ",
  );
  for (const { pattern } of WEEKDAY_PATTERNS) {
    out = out.replace(
      new RegExp(
        `${DEADLINE_PREP_BOUNDARY}(?:на|к|до|в)\\s+(?:${pattern.source})${DEADLINE_PREP_END}`,
        "giu",
      ),
      " ",
    );
  }
  return out;
}

/** Убирает маркеры дедлайна из текста (описание/title после извлечения deadlineDate). */
export function stripDeadlineMarkersFromText(text: string): string | undefined {
  let s = text;
  s = stripPrepositionalDeadlinePhrases(s);
  s = s.replace(/(?:^|[\s,.!?;:—-])(?:сегодня|завтра|послезавтра)(?=$|[\s,.!?;:—-])/giu, " ");
  s = s.replace(
    /(?:в\s+)?следующ(?:ем|ий)\s+месяц(?:е)?(?:\s+до\s+\d{1,2}\s*числ(?:а)?)?|\d{1,2}\s*числ(?:а)?\s+следующ(?:его|ем)\s+месяца|через\s+месяц/giu,
    "",
  );
  s = s.replace(ORDINAL_STANDARD_ORDER_RE, " ");
  s = s.replace(ORDINAL_REVERSED_ORDER_RE, " ");
  for (const { pattern } of WEEKDAY_PATTERNS) {
    s = s.replace(
      new RegExp(`${DEADLINE_PREP_BOUNDARY}(?:${pattern.source})${DEADLINE_PREP_END}`, "giu"),
      " ",
    );
  }
  s = s.replace(/(?:до|к|на|в)\s+\d{1,2}\.\d{1,2}\.\d{4}/giu, "");
  s = s.replace(/\d{4}-\d{2}-\d{2}/g, "");
  s = s.trim().replace(/\s{2,}/g, " ");
  s = s.replace(/^\s*(?:на|к|до|в)\s+/iu, "").trim();
  return s.length > 0 ? s : undefined;
}

/** ISO date → DD.MM.YYYY для ответов бота. */
export function formatIsoDateRu(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

const ISO_DATE_IN_TEXT_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

/** Заменяет YYYY-MM-DD в произвольном тексте на DD.MM.YYYY (для заметок и описаний). */
export function replaceIsoDatesInText(text: string): string {
  return text.replace(ISO_DATE_IN_TEXT_RE, (iso) => formatIsoDateRu(iso));
}

const DATE_RE = /\d{1,2}\.\d{1,2}\.\d{4}/g;

/** Текст команды /deadline: последняя DD.MM.YYYY — дата, всё до неё — название задачи. */
export function parseDeadlineCommandPayload(
  payload: string,
): { title: string; dateIso: string } | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  DATE_RE.lastIndex = 0;
  while ((m = DATE_RE.exec(trimmed)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch) return null;

  const dateIso = parseRuDate(lastMatch[0]);
  if (!dateIso) return null;

  const title = trimmed.slice(0, lastMatch.index).trim();
  if (!title) return null;

  return { title, dateIso };
}

const RELATIVE_MONTH_DEADLINE_SELF_CHECK_BASE = "2026-05-22";

const RELATIVE_MONTH_DEADLINE_SELF_CHECK_CASES: ReadonlyArray<{
  text: string;
  expected: string;
}> = [
  {
    text: "Поставь задачу Васе заключить договор с Ешкин Кот в следующем месяце",
    expected: "2026-06-01",
  },
  {
    text: "Поставь задачу Васе заключить договор через месяц",
    expected: "2026-06-22",
  },
  {
    text: "Поставь задачу Васе заключить договор в следующем месяце 15 числа",
    expected: "2026-06-15",
  },
];

/** Dev-проверка парсинга «следующий месяц» / «через месяц» (запуск из main при BOT_DEV_SELF_CHECKS=true). */
export function devLogRelativeMonthDeadlineChecks(
  baseDate: string = RELATIVE_MONTH_DEADLINE_SELF_CHECK_BASE,
): void {
  for (const { text, expected } of RELATIVE_MONTH_DEADLINE_SELF_CHECK_CASES) {
    const got = resolveDeadlineFromUserMessage(text, baseDate);
    const ok = got === expected;
    const line = ok ? "OK" : "FAIL";
    console.log(`[parse-ru-date] relative month deadline ${line}`, {
      text,
      expected,
      got,
    });
  }

  const stripped = stripDeadlineMarkersFromText("на сегодня продать стулья остапу");
  const stripOk =
    stripped === "продать стулья остапу" && !isRelativeDeadlineKeyword("сегодня");
  console.log(`[parse-ru-date] strip deadline prep from title ${stripOk ? "OK" : "FAIL"}`, {
    stripped,
  });
}
