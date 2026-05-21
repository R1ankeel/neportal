import { preprocessAiIntentInput } from "./ai-contracts";
import { coerceDeadlineDateLoose, extractDeadlineFromRussianText } from "./parse-ru-date";

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

  if (intent === "create_task" || intent === "set_task_deadline") {
    if (typeof p.deadlineDate === "string") {
      const coerced = coerceDeadlineDateLoose(p.deadlineDate, opts.baseDate);
      if (coerced) p.deadlineDate = coerced;
      else delete p.deadlineDate;
    }

    if (!p.deadlineDate && intent === "create_task") {
      const combined = [opts.userText, p.title, p.description]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .join(" ");
      if (combined) {
        const extracted = extractDeadlineFromRussianText(combined, opts.baseDate);
        if (extracted.deadlineDate) p.deadlineDate = extracted.deadlineDate;
      }
    }
  }

  return { ...obj, payload: p };
}
