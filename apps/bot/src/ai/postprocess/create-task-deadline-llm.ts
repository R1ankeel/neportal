import { CREATE_TASK_DEADLINE_PROMPT } from "../prompts/create-task-deadline-prompt";
import { devLog } from "../../dev-log";
import {
  extractDeadlineFromRussianText,
  extractOrdinalWeekdayDate,
  getWeekdayMentionDow,
  hasRussianDateHint,
  isIsoDateString,
  NEXT_CALENDAR_MONTH_RE,
  THROUGH_ONE_MONTH_RE,
} from "../../parse-ru-date";
import { getAiProviderState } from "../provider/registry";
import { requestAiJson } from "../../yandex-gpt";

export type CreateTaskDeadlineLlmResult = {
  deadlineDate: string;
  datePhrase?: string;
};

const MONTH_GENITIVE_TO_NUMBER: ReadonlyArray<{ pattern: RegExp; month: number }> = [
  { pattern: /январ/i, month: 1 },
  { pattern: /феврал/i, month: 2 },
  { pattern: /марта|марте|март(?![а-яё])/i, month: 3 },
  { pattern: /апрел/i, month: 4 },
  { pattern: /мая|мае|ма[йй]/i, month: 5 },
  { pattern: /июня|июне|июн(?![а-яё])/i, month: 6 },
  { pattern: /июля|июле|июл(?![а-яё])/i, month: 7 },
  { pattern: /август/i, month: 8 },
  { pattern: /сентябр/i, month: 9 },
  { pattern: /октябр/i, month: 10 },
  { pattern: /ноябр/i, month: 11 },
  { pattern: /декабр/i, month: 12 },
];

const ORDINAL_IN_TEXT_RE =
  /(?:перв|втор|трет|четверт|четвёрт|последн)(?:ый|ая|ое|ую|ого|ой|ий|ья|ью|ьего|юю|нюю|его)?/iu;

function parseOrdinalKind(fragment: string): 1 | 2 | 3 | 4 | "last" | null {
  const lower = fragment.toLowerCase().replace(/ё/g, "е");
  if (/^перв/u.test(lower)) return 1;
  if (/^втор/u.test(lower)) return 2;
  if (/^трет/u.test(lower)) return 3;
  if (/^четверт/u.test(lower)) return 4;
  if (/^последн/u.test(lower)) return "last";
  return null;
}

function resolveOrdinalWeekdayInCalendarMonth(
  year: number,
  month: number,
  targetDow: number,
  ordinal: 1 | 2 | 3 | 4 | "last",
): string | null {
  const monthIndex = month - 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  let firstDowDay = 1;
  while (firstDowDay <= daysInMonth) {
    const dow = new Date(Date.UTC(year, monthIndex, firstDowDay)).getUTCDay();
    if (dow === targetDow) break;
    firstDowDay++;
  }
  if (firstDowDay > daysInMonth) return null;

  let targetDay: number;
  if (ordinal === "last") {
    targetDay = firstDowDay;
    let candidate = firstDowDay + 7;
    while (candidate <= daysInMonth) {
      targetDay = candidate;
      candidate += 7;
    }
  } else {
    targetDay = firstDowDay + 7 * (ordinal - 1);
    if (targetDay > daysInMonth) return null;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(targetDay).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Dev/mock: именованный месяц + ordinal weekday без LLM API. */
export function resolveNamedMonthOrdinalWeekdayDev(
  text: string,
  baseDate: string,
): CreateTaskDeadlineLlmResult | null {
  const lower = text.toLowerCase().replace(/ё/g, "е");
  let monthNum: number | null = null;
  for (const { pattern, month } of MONTH_GENITIVE_TO_NUMBER) {
    if (pattern.test(lower)) {
      monthNum = month;
      break;
    }
  }
  if (monthNum === null) return null;

  const ordinalMatch = lower.match(ORDINAL_IN_TEXT_RE);
  const ordinal = ordinalMatch ? parseOrdinalKind(ordinalMatch[0]) : 1;
  if (ordinal === null) return null;

  const dow = getWeekdayMentionDow(text);
  if (dow === null) return null;

  const [y, m] = baseDate.split("-").map(Number);
  let year = y;
  if (monthNum < m) year += 1;

  const deadlineDate = resolveOrdinalWeekdayInCalendarMonth(year, monthNum, dow, ordinal);
  if (!deadlineDate) return null;

  const origLower = text.toLowerCase().replace(/ё/g, "е");
  const datePhrase = extractDatePhraseSubstring(text, origLower, monthNum, ordinalMatch?.[0]);

  return { deadlineDate, datePhrase: datePhrase ?? undefined };
}

function extractDatePhraseSubstring(
  original: string,
  lower: string,
  _monthNum: number,
  ordinalWord?: string,
): string | null {
  const monthEntry = MONTH_GENITIVE_TO_NUMBER.find(({ pattern }) => pattern.test(lower));
  if (!monthEntry) return null;

  const monthMatch = lower.match(monthEntry.pattern);
  if (!monthMatch) return null;

  const weekdayPatterns = [
    /понедельник(?:а|у|е)?/iu,
    /вторник(?:а|у|е)?/iu,
    /сред(?:а|у|ы|е)?/iu,
    /четверг(?:а|у|е)?/iu,
    /пятниц(?:а|у|ы|е)?/iu,
    /суббот(?:а|у|ы|е)?/iu,
    /воскресень(?:е|я|ю)?/iu,
  ];

  let weekdayWord = "";
  for (const p of weekdayPatterns) {
    const m = lower.match(p);
    if (m) {
      weekdayWord = m[0];
      break;
    }
  }

  const parts: string[] = [];
  if (ordinalWord) parts.push(ordinalWord);
  if (weekdayWord) parts.push(weekdayWord);
  parts.push(monthMatch[0]);

  const needle = parts.join(" ").replace(/ё/g, "е");
  const idx = lower.indexOf(needle.replace(/\s+/g, " ").trim());
  if (idx < 0) {
    const prepMatch = lower.match(
      new RegExp(
        `(?:на|к|ко|до|в)\\s+(?:${ordinalWord ?? ""}\\s+)?${weekdayWord}\\s+${monthMatch[0]}`.replace(
          /\s+/g,
          "\\s+",
        ),
        "iu",
      ),
    );
    if (prepMatch) {
      const start = lower.indexOf(prepMatch[0].toLowerCase().replace(/ё/g, "е"));
      if (start >= 0) return original.slice(start, start + prepMatch[0].length).trim();
    }
    return null;
  }

  return original.slice(idx, idx + needle.length).trim();
}

function isValidDeadlineLlmPayload(parsed: unknown): parsed is {
  deadlineDate: string;
  datePhrase?: string | null;
} {
  if (!parsed || typeof parsed !== "object") return false;
  const d = (parsed as { deadlineDate?: unknown }).deadlineDate;
  return typeof d === "string" && isIsoDateString(d.trim());
}

/** Нужен ли LLM-резолв (любой date hint кроме DD.MM/ISO и только завтра/сегодня/послезавтра). */
export function needsLlmDeadlineResolution(userText: string): boolean {
  const trimmed = userText.trim();
  if (!trimmed || !hasRussianDateHint(trimmed)) return false;

  if (/\d{1,2}\.\d{1,2}(?:\.\d{4})?/.test(trimmed) || /\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return false;
  }

  if (extractOrdinalWeekdayDate(trimmed, "2026-01-01")) return false;

  const lower = trimmed.toLowerCase().replace(/ё/g, "е");
  const hasMonthContext =
    NEXT_CALENDAR_MONTH_RE.test(lower) ||
    THROUGH_ONE_MONTH_RE.test(lower) ||
    MONTH_GENITIVE_TO_NUMBER.some(({ pattern }) => pattern.test(lower));
  const hasOrdinal = ORDINAL_IN_TEXT_RE.test(lower);

  if (getWeekdayMentionDow(trimmed) !== null && !hasMonthContext && !hasOrdinal) {
    return false;
  }

  const hasSimpleRelative = /(?:^|[\s,.!?;:—-])(?:завтра|сегодня|послезавтра)(?:$|[\s,.!?;:—-])/u.test(
    lower,
  );
  if (!hasSimpleRelative) return true;

  if (getWeekdayMentionDow(trimmed) !== null) return true;
  if (hasMonthContext) return true;
  if (hasOrdinal) return true;
  if (/через\s+(?:\d+|\w+)/u.test(lower)) return true;

  return false;
}

/** Dev/mock без API: ordinal next month + named month. */
export function resolveCreateTaskDeadlineDevMock(
  userText: string,
  baseDate: string,
): CreateTaskDeadlineLlmResult | null {
  const ordinal = extractOrdinalWeekdayDate(userText, baseDate);
  if (ordinal) {
    return { deadlineDate: ordinal.deadlineDate, datePhrase: ordinal.matchedText };
  }

  const named = resolveNamedMonthOrdinalWeekdayDev(userText, baseDate);
  if (named) return named;

  const relative = extractDeadlineFromRussianText(userText, baseDate);
  if (relative.deadlineDate) {
    return { deadlineDate: relative.deadlineDate };
  }

  return null;
}

/** LLM-резолв дедлайна из userText. */
export async function resolveCreateTaskDeadlineWithAi(
  userText: string,
  baseDate: string,
): Promise<CreateTaskDeadlineLlmResult | null> {
  const trimmed = userText.trim();
  if (!trimmed) return null;

  if (process.env.BOT_DEV_MOCK_DEADLINE_LLM === "true") {
    return resolveCreateTaskDeadlineDevMock(trimmed, baseDate);
  }

  const providerState = getAiProviderState();
  if (!providerState.enabled) return null;

  const startedAt = Date.now();
  const userPrompt = `Сегодня: ${baseDate}\n\nТекст пользователя:\n${trimmed}`;

  const result = await requestAiJson({
    promptGroup: "create-task-deadline",
    systemPrompt: CREATE_TASK_DEADLINE_PROMPT,
    userPrompt,
    userText: trimmed,
    temperature: 0,
    maxTokens: 96,
    validate: isValidDeadlineLlmPayload,
  });

  const latencyMs = Date.now() - startedAt;

  if (!result.ok || !isValidDeadlineLlmPayload(result.parsed)) {
    devLog("create_task deadline-llm failed", {
      ok: result.ok,
      latencyMs,
    });
    return null;
  }

  const deadlineDate = result.parsed.deadlineDate.trim();
  const datePhrase =
    typeof result.parsed.datePhrase === "string" && result.parsed.datePhrase.trim()
      ? result.parsed.datePhrase.trim()
      : undefined;

  devLog("create_task deadline-llm ok", {
    latencyMs,
    deadlineDate,
    datePhrase: datePhrase ?? null,
  });

  return { deadlineDate, datePhrase };
}
