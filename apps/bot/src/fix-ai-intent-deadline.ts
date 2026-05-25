import { preprocessAiIntentInput } from "./ai-contracts";
import { applyCreateAbsenceDateFix } from "./fix-ai-intent-absence-dates";
import { applyCreateAbsenceUserSelfFix } from "./fix-ai-intent-absence-user";
import { applyCancelAbsenceUserSelfFix } from "./fix-ai-intent-cancel-absence-user";
import { applyCreateTaskAssigneeSelfFix } from "./fix-ai-intent-assignee";
import { applyAddTaskCommentPayloadFix } from "./fix-ai-intent-add-task-comment";
import { applyTransferTaskCommentFix } from "./fix-ai-intent-transfer-comment";
import {
  applyCreateTaskPayloadCompatibilityFix,
} from "./fix-ai-intent-create-task";
import {
  coerceDeadlineDateLoose,
  correctNextCalendarMonthMisparse,
  extractDeadlineFromRussianText,
  hasRussianDateHint,
  resolveDeadlineFromUserMessage,
} from "./parse-ru-date";

function applyDeadlineFields(
  p: Record<string, unknown>,
  intent: string,
  opts: { baseDate: string; userText?: string },
): void {
  const userText = opts.userText?.trim();

  if (userText) {
    const fromUser = resolveDeadlineFromUserMessage(userText, opts.baseDate);
    if (fromUser && hasRussianDateHint(userText)) {
      p.deadlineDate = fromUser;
      return;
    }
  }

  if (typeof p.deadlineDate === "string") {
    const coerced = coerceDeadlineDateLoose(p.deadlineDate, opts.baseDate);
    if (coerced) p.deadlineDate = coerced;
    else delete p.deadlineDate;
  }

  if (userText && typeof p.deadlineDate === "string") {
    const corrected = correctNextCalendarMonthMisparse(
      userText,
      opts.baseDate,
      p.deadlineDate,
    );
    if (corrected) p.deadlineDate = corrected;
  }

  if (!p.deadlineDate && intent === "create_task") {
    const combined = [p.title, p.description]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .join(" ");
    if (combined) {
      const extracted = extractDeadlineFromRussianText(combined, opts.baseDate);
      if (extracted.deadlineDate) p.deadlineDate = extracted.deadlineDate;
    }
  }
}

/** Исправляет deadlineDate от модели до Zod-валидации. */
export function fixAiIntentBeforeValidation(
  parsed: unknown,
  opts: { baseDate: string; userText?: string },
): unknown {
  const preprocessed = preprocessAiIntentInput(parsed);
  if (typeof preprocessed !== "object" || preprocessed === null || Array.isArray(preprocessed)) {
    return preprocessed;
  }

  const obj = preprocessed as Record<string, unknown>;
  const intent = obj.intent;
  const payload = obj.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return preprocessed;
  }

  const p = { ...(payload as Record<string, unknown>) };

  if (intent === "create_task") {
    applyCreateTaskPayloadCompatibilityFix(p);
    applyCreateTaskAssigneeSelfFix(p, opts.userText);
  } else if (intent === "create_absence") {
    applyCreateAbsenceUserSelfFix(p, opts.userText);
    applyCreateAbsenceDateFix(p, opts.userText, opts.baseDate);
  } else if (intent === "cancel_absence") {
    applyCancelAbsenceUserSelfFix(p, opts.userText);
  } else if (intent === "set_task_deadline") {
    applyDeadlineFields(p, intent as string, opts);
  } else if (intent === "add_task_comment") {
    applyAddTaskCommentPayloadFix(p, opts.userText);
  } else if (intent === "transfer_task" || intent === "reassign_task") {
    applyTransferTaskCommentFix(p, opts.userText);
  }

  return { ...obj, payload: p };
}
