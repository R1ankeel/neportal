import { devLog } from "../../dev-log";
import {
  coerceDeadlineDateLoose,
  correctNextCalendarMonthMisparse,
  extractDeadlineFromRussianText,
  hasRussianDateHint,
  parseRuDate,
  resolveDeadlineFromUserMessage,
  stripDeadlineMarkersFromText,
} from "../../parse-ru-date";
import { normalizeBasicTaskTitle } from "../deterministic/basic-create-task-text";
import { extractOrdinalWeekdayNextMonth } from "../../parse-ru-date";
import {
  cleanupDescriptionAfterDeadline,
  extractSupplementalDescriptionFromUserText,
  isDateOnlyOrWeakTitle,
  recoverCreateTaskTitleFromOriginalText,
  stripDateFromTitle,
  stripMatchedDateExpression,
} from "./create-task-text-cleanup";

export type PostProcessCreateTaskOpts = {
  userText: string;
  baseDate: string;
};

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

function resolveCreateTaskDeadline(
  payload: Record<string, unknown>,
  userText: string,
  baseDate: string,
): { deadlineDate?: string; ordinalMatch: ReturnType<typeof extractOrdinalWeekdayNextMonth> } {
  const trimmed = userText.trim();
  const aiDeadline =
    typeof payload.deadlineDate === "string" ? payload.deadlineDate.trim() : undefined;

  const ordinalMatch = trimmed ? extractOrdinalWeekdayNextMonth(trimmed, baseDate) : null;
  if (ordinalMatch) {
    if (aiDeadline && aiDeadline !== ordinalMatch.deadlineDate) {
      devLog("create_task deadline override", {
        source: "deterministic-relative-date",
        matchedText: ordinalMatch.matchedText,
        aiDeadlineDate: aiDeadline,
        resolvedDeadlineDate: ordinalMatch.deadlineDate,
        currentDate: baseDate,
      });
    }
    return { deadlineDate: ordinalMatch.deadlineDate, ordinalMatch };
  }

  let deadlineDate: string | undefined;

  const bareRuDate = trimmed.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
  if (bareRuDate) {
    const iso = parseRuDate(bareRuDate[1]);
    if (iso) deadlineDate = iso;
  }

  if (!deadlineDate && trimmed && hasRussianDateHint(trimmed)) {
    const fromUser = resolveDeadlineFromUserMessage(trimmed, baseDate);
    if (fromUser) deadlineDate = fromUser;
  }

  if (!deadlineDate && aiDeadline) {
    deadlineDate = coerceDeadlineDateLoose(aiDeadline, baseDate);
  }

  if (trimmed && deadlineDate) {
    const corrected = correctNextCalendarMonthMisparse(trimmed, baseDate, deadlineDate);
    if (corrected) deadlineDate = corrected;
  }

  if (!deadlineDate) {
    const combined = [payload.title, payload.description]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .join(" ");
    if (combined) {
      const extracted = extractDeadlineFromRussianText(combined, baseDate);
      if (extracted.deadlineDate) deadlineDate = extracted.deadlineDate;
    }
  }

  return { deadlineDate, ordinalMatch: null };
}

/**
 * Deterministic post-processing create_task после AI parsing.
 * Provider-independent: одинаковый результат для yandex/qwen.
 */
export function postProcessCreateTaskPayload(
  payload: Record<string, unknown>,
  opts: PostProcessCreateTaskOpts,
): void {
  const userText = opts.userText.trim();
  const baseDate = opts.baseDate;

  const assigneeHint =
    typeof payload.assigneeHint === "string" ? payload.assigneeHint.trim() : undefined;

  const { deadlineDate, ordinalMatch } = resolveCreateTaskDeadline(payload, userText, baseDate);
  if (deadlineDate) {
    payload.deadlineDate = deadlineDate;
  } else {
    delete payload.deadlineDate;
  }

  const matchedText = ordinalMatch?.matchedText;

  let title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (title) {
    title = stripDateFromTitle(title, ordinalMatch, baseDate);
    if (matchedText) title = stripMatchedDateExpression(title, matchedText);
    const stripped = stripDeadlineMarkersFromText(title);
    if (stripped) title = stripped;
    title = title.replace(/(?:^|[\s,.!?;:—-])задачу(?=$|[\s,.!?;:—-])/giu, " ").trim();
  }

  if (isDateOnlyOrWeakTitle(title, matchedText, assigneeHint) && userText) {
    const recovered = recoverCreateTaskTitleFromOriginalText(userText, {
      assigneeHint,
      matchedText,
      baseDate,
    });
    if (recovered) title = recovered;
  }

  if (title) {
    payload.title = normalizeBasicTaskTitle(title);
  } else {
    delete payload.title;
  }

  let description =
    typeof payload.description === "string" ? payload.description.trim() : undefined;

  if (!description && userText && typeof payload.title === "string" && payload.title.trim()) {
    const supplemental = extractSupplementalDescriptionFromUserText(userText, payload.title, {
      assigneeHint,
      matchedText,
      baseDate,
    });
    if (supplemental) description = supplemental;
  }

  description = cleanupDescriptionAfterDeadline(description, {
    matchedText,
    deadlineDate,
    baseDate,
    title: typeof payload.title === "string" ? payload.title : undefined,
  });

  if (description && typeof payload.title === "string") {
    if (normalizeComparable(description) === normalizeComparable(payload.title)) {
      description = undefined;
    }
  }

  if (description) {
    payload.description = description;
  } else {
    delete payload.description;
  }
}
