import { devLog } from "../../dev-log";
import {
  coerceDeadlineDateLoose,
  correctNextCalendarMonthMisparse,
  extractDeadlineFromRussianText,
  extractOrdinalWeekdayDate,
  hasRussianDateHint,
  isIsoDateString,
  parseRuDateInFuture,
  stripDeadlineMarkersFromText,
} from "../../parse-ru-date";
import { normalizeBasicTaskTitle } from "../deterministic/basic-create-task-text";
import {
  needsLlmDeadlineResolution,
  resolveCreateTaskDeadlineWithAi,
} from "./create-task-deadline-llm";
import {
  cleanupDescriptionAfterDeadline,
  extractSupplementalDescriptionFromUserText,
  isDateOnlyOrWeakTitle,
  recoverCreateTaskTitleFromOriginalText,
  stripDateFromTitle,
  stripMatchedDateExpression,
} from "./create-task-text-cleanup";
import { normalizeStructuredCreateTaskDescription } from "./create-task-structured-description";

export type PostProcessCreateTaskOpts = {
  userText: string;
  baseDate: string;
};

export type DeadlineResolution = {
  deadlineDate?: string;
  matchedText?: string;
  source?: "deterministic-deadline-resolver" | "llm-deadline-resolver" | "ai-deadline-fallback";
};

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

/** Trivial sync deadline: absolute date, завтра/сегодня/послезавтра only. */
export function resolveCreateTaskDeadlineTrivial(
  userText: string,
  baseDate: string,
): DeadlineResolution {
  const trimmed = userText.trim();
  if (!trimmed) return {};

  const isoInText = trimmed.match(/\d{4}-\d{2}-\d{2}/);
  if (isoInText && isIsoDateString(isoInText[1])) {
    return {
      deadlineDate: isoInText[1],
      matchedText: isoInText[1],
      source: "deterministic-deadline-resolver",
    };
  }

  const ordinal = extractOrdinalWeekdayDate(trimmed, baseDate);
  if (ordinal) {
    return {
      deadlineDate: ordinal.deadlineDate,
      matchedText: ordinal.matchedText,
      source: "deterministic-deadline-resolver",
    };
  }

  const bareRuDate = trimmed.match(/(\d{1,2}\.\d{1,2}(?:\.\d{4})?)/);
  if (bareRuDate) {
    const iso = parseRuDateInFuture(bareRuDate[1], baseDate);
    if (iso) {
      return {
        deadlineDate: iso,
        matchedText: bareRuDate[1],
        source: "deterministic-deadline-resolver",
      };
    }
  }

  if (hasRussianDateHint(trimmed)) {
    const relative = extractDeadlineFromRussianText(trimmed, baseDate);
    if (relative.deadlineDate) {
      return {
        deadlineDate: relative.deadlineDate,
        source: "deterministic-deadline-resolver",
      };
    }
  }

  if (needsLlmDeadlineResolution(trimmed)) {
    return {};
  }

  return {};
}

/** Async deadline: LLM + AI fallback. */
export async function resolveCreateTaskDeadlineAsync(
  payload: Record<string, unknown>,
  userText: string,
  baseDate: string,
): Promise<DeadlineResolution> {
  const trimmed = userText.trim();
  const aiDeadline =
    typeof payload.deadlineDate === "string" ? payload.deadlineDate.trim() : undefined;

  const trivial = resolveCreateTaskDeadlineTrivial(trimmed, baseDate);
  if (trivial.deadlineDate) {
    devLog("create_task deadline resolved", {
      source: trivial.source ?? "deterministic-deadline-resolver",
      matchedText: trivial.matchedText ?? null,
      aiDeadlineDate: aiDeadline ?? null,
      resolvedDeadlineDate: trivial.deadlineDate,
      baseDate,
    });
    return trivial;
  }

  if (trimmed && needsLlmDeadlineResolution(trimmed)) {
    const llm = await resolveCreateTaskDeadlineWithAi(trimmed, baseDate);
    if (llm) {
      if (aiDeadline && aiDeadline !== llm.deadlineDate) {
        devLog("create_task deadline override", {
          source: "llm-deadline-resolver",
          matchedText: llm.datePhrase ?? null,
          aiDeadlineDate: aiDeadline,
          resolvedDeadlineDate: llm.deadlineDate,
          baseDate,
        });
      }
      devLog("create_task deadline resolved", {
        source: "llm-deadline-resolver",
        matchedText: llm.datePhrase ?? null,
        aiDeadlineDate: aiDeadline ?? null,
        resolvedDeadlineDate: llm.deadlineDate,
        baseDate,
      });
      return {
        deadlineDate: llm.deadlineDate,
        matchedText: llm.datePhrase,
        source: "llm-deadline-resolver",
      };
    }
  }

  let deadlineDate: string | undefined;
  if (aiDeadline) {
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

  if (deadlineDate) {
    devLog("create_task deadline resolved", {
      source: "ai-deadline-fallback",
      matchedText: null,
      aiDeadlineDate: aiDeadline ?? null,
      resolvedDeadlineDate: deadlineDate,
      baseDate,
    });
  }

  return { deadlineDate, source: deadlineDate ? "ai-deadline-fallback" : undefined };
}

function applyCreateTaskTitleDescriptionCleanup(
  payload: Record<string, unknown>,
  opts: PostProcessCreateTaskOpts,
  deadline: DeadlineResolution,
): void {
  const userText = opts.userText.trim();
  const baseDate = opts.baseDate;
  const assigneeHint =
    typeof payload.assigneeHint === "string" ? payload.assigneeHint.trim() : undefined;

  const matchedText = deadline.matchedText;
  const deadlineDate = deadline.deadlineDate;

  let title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (title) {
    title = stripDateFromTitle(title, null, baseDate);
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

/**
 * Async post-processing create_task: LLM deadline + title/description cleanup.
 */
export async function postProcessCreateTaskPayloadAsync(
  payload: Record<string, unknown>,
  opts: PostProcessCreateTaskOpts,
): Promise<void> {
  const deadline = await resolveCreateTaskDeadlineAsync(payload, opts.userText, opts.baseDate);

  if (deadline.deadlineDate) {
    payload.deadlineDate = deadline.deadlineDate;
  } else {
    delete payload.deadlineDate;
  }

  applyCreateTaskTitleDescriptionCleanup(payload, opts, deadline);

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (title) {
    const description = typeof payload.description === "string" ? payload.description : undefined;
    const structured = await normalizeStructuredCreateTaskDescription({
      originalText: opts.userText,
      title,
      description,
      deadlineDate: typeof payload.deadlineDate === "string" ? payload.deadlineDate : undefined,
    });
    payload.title = structured.title;
    if (structured.description && structured.description.trim()) {
      payload.description = structured.description;
    } else {
      delete payload.description;
    }
  }
}

/**
 * @deprecated Sync-only path; use postProcessCreateTaskPayloadAsync from LLM flow.
 * Kept for dev tests with BOT_DEV_MOCK_DEADLINE_LLM.
 */
export async function postProcessCreateTaskPayload(
  payload: Record<string, unknown>,
  opts: PostProcessCreateTaskOpts,
): Promise<void> {
  if (process.env.BOT_DEV_MOCK_DEADLINE_LLM === "true") {
    await postProcessCreateTaskPayloadAsync(payload, opts);
    return;
  }

  const deadline = resolveCreateTaskDeadlineTrivial(opts.userText, opts.baseDate);
  if (deadline.deadlineDate) {
    payload.deadlineDate = deadline.deadlineDate;
  }
  applyCreateTaskTitleDescriptionCleanup(payload, opts, deadline);

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (title) {
    const description = typeof payload.description === "string" ? payload.description : undefined;
    const structured = await normalizeStructuredCreateTaskDescription({
      originalText: opts.userText,
      title,
      description,
      deadlineDate: typeof payload.deadlineDate === "string" ? payload.deadlineDate : undefined,
    });
    payload.title = structured.title;
    if (structured.description && structured.description.trim()) {
      payload.description = structured.description;
    } else {
      delete payload.description;
    }
  }
}
