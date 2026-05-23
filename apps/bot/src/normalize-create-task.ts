import type { AiIntent } from "./ai-contracts";
import { devLog } from "./dev-log";

type CreateTaskPayload = Extract<AiIntent, { intent: "create_task" }>["payload"];
import {
  coerceDeadlineDateLoose,
  extractDeadlineFromRussianText,
  hasRussianDateHint,
  resolveDeadlineFromUserMessage,
  stripDeadlineMarkersFromText,
  todayIsoDate,
} from "./parse-ru-date";

/** Дополняет payload, если модель положила «завтра» в description вместо deadlineDate. */
export function normalizeCreateTaskPayload(
  payload: CreateTaskPayload,
  opts?: { userText?: string; baseDate?: string },
): CreateTaskPayload {
  const baseDate = opts?.baseDate ?? todayIsoDate();
  let { title, description, deadlineDate, ...rest } = payload;

  const userText = opts?.userText?.trim();
  if (userText && hasRussianDateHint(userText)) {
    const fromUser = resolveDeadlineFromUserMessage(userText, baseDate);
    if (fromUser) deadlineDate = fromUser;
  } else if (deadlineDate) {
    deadlineDate = coerceDeadlineDateLoose(deadlineDate, baseDate);
  }

  const combined = [title, description].filter(Boolean).join(" ");
  if (!deadlineDate) {
    const extracted = extractDeadlineFromRussianText(combined, baseDate);
    if (extracted.deadlineDate) {
      deadlineDate = extracted.deadlineDate;
    }
  }

  if (deadlineDate) {
    const cleanedTitle = stripDeadlineMarkersFromText(title);
    if (cleanedTitle) title = cleanedTitle;

    if (description) {
      const cleanedDesc = stripDeadlineMarkersFromText(description);
      description =
        cleanedDesc && cleanedDesc.toLowerCase() !== title.toLowerCase()
          ? cleanedDesc
          : undefined;
    }
  }

  return { ...rest, title, description, deadlineDate };
}

/** Dev-предупреждение, если модель свалила всё в title без description. */
export function warnLongCreateTaskTitleWithoutDescription(
  title: string,
  description?: string,
): void {
  if (description?.trim()) return;
  const t = title.trim();
  if (t.length <= 80) return;
  const hasAnd = /\sи\s/i.test(t);
  const sentences = t.split(/[.!?…]+/).filter((s) => s.trim().length > 0);
  if (hasAnd || sentences.length > 1) {
    devLog("[create_task] long title without description", { titleLength: t.length });
  }
}
