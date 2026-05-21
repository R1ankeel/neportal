import type { AiIntent } from "./ai-contracts";

type CreateTaskPayload = Extract<AiIntent, { intent: "create_task" }>["payload"];
import {
  extractDeadlineFromRussianText,
  stripDeadlineMarkersFromText,
  todayIsoDate,
} from "./parse-ru-date";

/** Дополняет payload, если модель положила «завтра» в description вместо deadlineDate. */
export function normalizeCreateTaskPayload(payload: CreateTaskPayload): CreateTaskPayload {
  const baseDate = todayIsoDate();
  let { title, description, deadlineDate, ...rest } = payload;

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
