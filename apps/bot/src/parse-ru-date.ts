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

/** Сдвиг ISO date YYYY-MM-DD на N календарных дней (UTC). */
export function addDaysToIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Извлекает дедлайн из русского текста относительно baseDate (YYYY-MM-DD). */
export function extractDeadlineFromRussianText(
  text: string,
  baseDate: string = todayIsoDate(),
): { deadlineDate: string | null } {
  const lower = text.toLowerCase();

  if (/\bпослезавтра\b/u.test(lower)) {
    return { deadlineDate: addDaysToIsoDate(baseDate, 2) };
  }
  if (/\bзавтра\b/u.test(lower)) {
    return { deadlineDate: addDaysToIsoDate(baseDate, 1) };
  }
  if (/\bсегодня\b/u.test(lower)) {
    return { deadlineDate: baseDate };
  }

  const absMatch = text.match(/(?:до|к|на|в)\s+(\d{1,2}\.\d{1,2}\.\d{4})/iu);
  if (absMatch) {
    const iso = parseRuDate(absMatch[1]);
    if (iso) return { deadlineDate: iso };
  }

  const isoInText = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoInText) return { deadlineDate: isoInText[1] };

  return { deadlineDate: null };
}

/** Убирает маркеры дедлайна из текста (описание/title после извлечения deadlineDate). */
export function stripDeadlineMarkersFromText(text: string): string | undefined {
  let s = text;
  s = s.replace(/\b(сегодня|завтра|послезавтра)\b/giu, "");
  s = s.replace(/(?:до|к|на|в)\s+\d{1,2}\.\d{1,2}\.\d{4}/giu, "");
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "");
  s = s.trim().replace(/\s{2,}/g, " ");
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
