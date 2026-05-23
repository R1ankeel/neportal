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

const CREATE_TASK_EXTRA_DETAIL_MARKERS: RegExp[] = [
  /\bпотом\b/i,
  /\bпосле\s+этого\b/i,
  /\bа\s+также\b/i,
  /\bзаодно\b/i,
  /\bплюс\b/i,
  /\bеще\b/i,
  /\bещё\b/i,
  /\bдалее\b/i,
  /\bс\s+отчет/i,
  /\bс\s+отчёт/i,
  /\bотчитаться\b/i,
];

function originalHasExtraDetailMarkers(originalText: string): boolean {
  return CREATE_TASK_EXTRA_DETAIL_MARKERS.some((re) => re.test(originalText));
}

function countNumberedDescriptionItems(description: string): number {
  return (description.match(/^\s*\d+\./gm) ?? []).length;
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

/** Dev-предупреждение: в исходном тексте есть «потом»/отчёт и т.п., а description пустой или урезан. */
export function warnPossibleLostDetailsInDescription(
  originalText: string,
  description?: string,
): void {
  const original = originalText.trim();
  if (!original || !originalHasExtraDetailMarkers(original)) return;

  const desc = description?.trim() ?? "";
  if (!desc) {
    devLog("[create_task] possible lost details in description", { reason: "empty" });
    return;
  }

  if (
    /\b(отчет|отчёт|отчитаться|вернуться\s+с)/i.test(original) &&
    !/\b(отчет|отчёт|отчитаться|вернуться|итог)/i.test(desc)
  ) {
    devLog("[create_task] possible lost details in description", { reason: "report_or_outcome" });
    return;
  }

  if (/\bпотом\b/i.test(original)) {
    const numbered = countNumberedDescriptionItems(desc);
    if (numbered > 0 && numbered < 3 && /\bи\b/i.test(original)) {
      devLog("[create_task] possible lost details in description", {
        reason: "potom_after_list",
        numberedItems: numbered,
      });
      return;
    }
  }

  if (original.length > 120 && desc.length < original.length * 0.2) {
    devLog("[create_task] possible lost details in description", {
      reason: "short_vs_original",
      descLength: desc.length,
      originalLength: original.length,
    });
  }
}
