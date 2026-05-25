import { normalizeBasicTaskTitle } from "../deterministic/basic-create-task-text";
import {
  extractOrdinalWeekdayDate,
  hasRussianDateHint,
  stripDeadlineMarkersFromText,
  type OrdinalWeekdayNextMonthMatch,
} from "../../parse-ru-date";

const CREATE_COMMAND_PREFIXES = [
  /^создай\s+задачу\s+/iu,
  /^создай\s+/iu,
  /^поставь\s+задачу\s+/iu,
  /^поставь\s+/iu,
  /^назначь\s+задачу\s+/iu,
  /^назначь\s+/iu,
  /^добавь\s+задачу\s+/iu,
  /^добавь\s+/iu,
  /^нужно\s+создать\s+задачу\s+/iu,
  /^нужно\s+создать\s+/iu,
];

const SELF_ASSIGNEE_MARKERS = /^(?:мне|меня|себе|на\s+меня)$/iu;

function normalizeForCompare(text: string): string {
  return text.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Удаляет matched date expression и варианты с предлогами / без них. */
export function stripMatchedDateExpression(text: string, matchedText: string): string {
  const trimmed = text.trim();
  if (!trimmed || !matchedText.trim()) return trimmed;

  let out = trimmed;
  const core = matchedText.trim();
  const coreEsc = escapeRegExp(core);

  const variants = [
    core,
    core.replace(/ё/g, "е"),
    core.replace(/е/g, "ё"),
  ];

  for (const variant of variants) {
    const esc = escapeRegExp(variant);
    out = out.replace(
      new RegExp(`(?:^|[\\s,.!?;:—-])(?:на|к|ко|до|в)\\s+${esc}(?=$|[\\s,.!?;:—-])`, "giu"),
      " ",
    );
    out = out.replace(
      new RegExp(`(?:^|[\\s,.!?;:—-])${esc}(?=$|[\\s,.!?;:—-])`, "giu"),
      " ",
    );
  }

  out = out.replace(new RegExp(coreEsc, "giu"), " ");
  out = out.trim().replace(/\s{2,}/g, " ");
  out = out.replace(/^\s*(?:на|к|ко|до|в)\s+/iu, "").trim();
  out = out.replace(/\s*(?:на|к|ко|до|в)\s*$/iu, "").trim();
  return out;
}

function stripAssigneePhrases(text: string, assigneeHint?: string): string {
  let out = text.trim();
  if (!assigneeHint?.trim()) return out;

  out = out.replace(/(?:^|[\s,.!?;:—-])задачу(?=$|[\s,.!?;:—-])/giu, " ");

  const hint = assigneeHint.trim();
  const hintEsc = escapeRegExp(hint);
  const stem = hint.replace(/[еуюиой]$/iu, "").trim();
  const stemEsc = stem.length >= 2 ? escapeRegExp(stem) : hintEsc;

  const wb = "(?:^|[\\s,.!?;:—-])";
  const we = "(?=$|[\\s,.!?;:—-])";
  out = out.replace(new RegExp(`${wb}для\\s+${hintEsc}${we}`, "giu"), " ");
  out = out.replace(new RegExp(`${wb}для\\s+${stemEsc}[а-яё]*${we}`, "giu"), " ");
  out = out.replace(new RegExp(`${wb}на\\s+${hintEsc}${we}`, "giu"), " ");
  out = out.replace(new RegExp(`${wb}на\\s+${stemEsc}[а-яё]*${we}`, "giu"), " ");
  out = out.replace(new RegExp(`${wb}${hintEsc}${we}`, "giu"), " ");
  out = out.replace(new RegExp(`${wb}${stemEsc}[а-яё]*${we}`, "giu"), " ");

  return out.trim().replace(/\s{2,}/g, " ");
}

function stripCommandAndNoise(text: string): string {
  let out = text.trim();
  for (const prefix of CREATE_COMMAND_PREFIXES) {
    if (prefix.test(out)) {
      out = out.replace(prefix, "").trim();
      break;
    }
  }
  out = out.replace(/(?:^|[\s,.!?;:—-])задачу(?=$|[\s,.!?;:—-])/giu, " ");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}

export type RecoverTitleOpts = {
  assigneeHint?: string;
  matchedText?: string;
  baseDate?: string;
};

/** Восстанавливает title из исходного сообщения пользователя. */
export function recoverCreateTaskTitleFromOriginalText(
  originalText: string,
  opts: RecoverTitleOpts = {},
): string | undefined {
  let text = originalText.trim();
  if (!text) return undefined;

  text = stripCommandAndNoise(text);
  if (opts.assigneeHint && !SELF_ASSIGNEE_MARKERS.test(opts.assigneeHint.trim())) {
    text = stripAssigneePhrases(text, opts.assigneeHint);
  }
  if (opts.matchedText) {
    text = stripMatchedDateExpression(text, opts.matchedText);
  } else if (opts.baseDate) {
    const ordinal = extractOrdinalWeekdayDate(text, opts.baseDate);
    if (ordinal) text = stripMatchedDateExpression(text, ordinal.matchedText);
  }

  text = stripDeadlineMarkersFromText(text) ?? text;
  text = text.replace(/^[,.!?;:—\s]+|[,.!?;:—\s]+$/g, "").trim();

  if (!text) return undefined;

  const firstSentence = text.split(/\.\s+/)[0]?.trim().replace(/[.!?]+$/g, "").trim();
  if (firstSentence) text = firstSentence;

  return normalizeBasicTaskTitle(text);
}

function titleLooksLikeDateOnly(title: string, matchedText?: string): boolean {
  const norm = normalizeForCompare(title);
  if (!norm) return true;

  if (matchedText && normalizeForCompare(matchedText) === norm) return true;
  if (matchedText && norm.includes(normalizeForCompare(matchedText))) {
    const stripped = stripMatchedDateExpression(title, matchedText).trim();
    if (!stripped || normalizeForCompare(stripped) === norm) return true;
  }

  const withoutMarkers = stripDeadlineMarkersFromText(title);
  if (!withoutMarkers?.trim()) return true;

  if (hasRussianDateHint(norm) && withoutMarkers.trim().length < 8) return true;

  return false;
}

/** Title пустой, только дата, совпадает с matched или похож на имя без действия. */
export function isDateOnlyOrWeakTitle(
  title: string | undefined | null,
  matchedText?: string,
  assigneeHint?: string,
): boolean {
  const t = title?.trim();
  if (!t) return true;

  if (titleLooksLikeDateOnly(t, matchedText)) return true;

  if (assigneeHint) {
    const normTitle = normalizeForCompare(t);
    const normHint = normalizeForCompare(assigneeHint);
    if (normTitle === normHint) return true;
    const hintStem = normHint.replace(/[еуюиой]$/, "");
    if (hintStem && normTitle === hintStem) return true;
  }

  return false;
}

export function cleanupDescriptionAfterDeadline(
  description: string | undefined | null,
  opts: {
    matchedText?: string;
    deadlineDate?: string;
    baseDate?: string;
    title?: string;
  },
): string | undefined {
  const desc = description?.trim();
  if (!desc) return undefined;

  let cleaned = desc;
  if (opts.matchedText) {
    cleaned = stripMatchedDateExpression(cleaned, opts.matchedText);
  }
  if (opts.baseDate) {
    const ordinal = extractOrdinalWeekdayDate(cleaned, opts.baseDate);
    if (ordinal) cleaned = stripMatchedDateExpression(cleaned, ordinal.matchedText);
  }

  const stripped = stripDeadlineMarkersFromText(cleaned);
  cleaned = stripped ?? cleaned;
  cleaned = cleaned.replace(/^[,.!?;:—\s]+|[,.!?;:—\s]+$/g, "").trim();

  if (!cleaned) return undefined;

  if (opts.title && normalizeForCompare(cleaned) === normalizeForCompare(opts.title)) {
    return undefined;
  }

  return cleaned;
}

/** Вторая и далее фразы после «. » в очищенном userText, если не дублируют title и не только дата. */
export function extractSupplementalDescriptionFromUserText(
  originalText: string,
  title: string,
  opts: RecoverTitleOpts = {},
): string | undefined {
  let text = originalText.trim();
  if (!text) return undefined;

  text = stripCommandAndNoise(text);
  if (opts.assigneeHint && !SELF_ASSIGNEE_MARKERS.test(opts.assigneeHint.trim())) {
    text = stripAssigneePhrases(text, opts.assigneeHint);
  }
  if (opts.matchedText) {
    text = stripMatchedDateExpression(text, opts.matchedText);
  } else if (opts.baseDate) {
    const ordinal = extractOrdinalWeekdayDate(text, opts.baseDate);
    if (ordinal) text = stripMatchedDateExpression(text, ordinal.matchedText);
  }

  const parts = text
    .split(/\.\s+/)
    .map((p) => p.trim().replace(/[.!?]+$/g, "").trim())
    .filter(Boolean);

  if (parts.length < 2) return undefined;

  const normTitle = normalizeForCompare(title);
  const extras: string[] = [];

  for (const part of parts) {
    const normPart = normalizeForCompare(part);
    if (!normPart) continue;
    if (normPart === normTitle || normTitle.includes(normPart) || normPart.includes(normTitle)) {
      continue;
    }
    if (titleLooksLikeDateOnly(part, opts.matchedText)) continue;
    const stripped = stripDeadlineMarkersFromText(part);
    if (!stripped?.trim()) continue;
    extras.push(stripped.trim());
  }

  if (extras.length === 0) return undefined;
  return extras.map((e) => normalizeBasicTaskTitle(e)).join(" ");
}

export function stripDateFromTitle(
  title: string,
  ordinalMatch: OrdinalWeekdayNextMonthMatch | null,
  baseDate?: string,
): string {
  let out = title.trim();
  if (ordinalMatch) {
    out = stripMatchedDateExpression(out, ordinalMatch.matchedText);
  } else if (baseDate) {
    const ordinal = extractOrdinalWeekdayDate(out, baseDate);
    if (ordinal) out = stripMatchedDateExpression(out, ordinal.matchedText);
  }
  const stripped = stripDeadlineMarkersFromText(out);
  return (stripped ?? out).trim();
}
