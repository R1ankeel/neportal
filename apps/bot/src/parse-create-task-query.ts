import type { AiIntent } from "./ai-contracts";
import { createTaskTextHasSelfAssigneeMarker } from "./fix-ai-intent-assignee";
import {
  resolveDeadlineFromUserMessage,
  stripDeadlineMarkersFromText,
} from "./parse-ru-date";
import { SELF_HINT_MARKER } from "./resolve-users-by-hint";

const NOTE_PREFIX = /^(?:создай|добавь|запиши)(?:те)?\s+заметк/iu;

const TITLE_FILLER_PREFIX = /^(?:тоже|еще|ещё|ну|и|а|кстати)\s+/iu;

type PatternMatch = {
  titleNorm: string;
  assigneeNorm?: string;
};

const CREATE_TASK_PATTERNS: Array<{
  re: RegExp;
  pick: (m: RegExpMatchArray) => PatternMatch | null;
}> = [
  {
    re: /^(?:поставь|назначь|дай)(?:те)?\s+(\p{L}+)\s+(?:задачу|хадачу)\s+(.+)$/iu,
    pick: (m) => ({ assigneeNorm: m[1]!, titleNorm: m[2]! }),
  },
  {
    re: /^(?:поручи|назначь|дай)(?:те)?\s+(\p{L}+)\s+(?:задачу|хадачу\s+)?(.+)$/iu,
    pick: (m) => ({ assigneeNorm: m[1]!, titleNorm: m[2]! }),
  },
  {
    re: /^(?:поставь|создай|добавь)(?:те)?\s+мне\s+(?:задачу|хадачу\s+)?(.+)$/iu,
    pick: (m) => ({ titleNorm: m[1]! }),
  },
  {
    re: /^(?:поставь|создай|добавь)(?:те)?\s+(?:задачу|хадачу)\s+(.+)$/iu,
    pick: (m) => ({ titleNorm: m[1]! }),
  },
  {
    re: /^(?:поставь|создай|добавь)(?:те)?\s+мне\s+(.+)$/iu,
    pick: (m) => ({ titleNorm: m[1]! }),
  },
];

function normalizeTaskInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function stripTitleFillers(normalized: string): string {
  let t = normalized.trim();
  while (TITLE_FILLER_PREFIX.test(t)) {
    t = t.replace(TITLE_FILLER_PREFIX, "").trim();
  }
  return t;
}

function extractPreservingCase(original: string, normalizedNeedle: string): string {
  const needle = normalizedNeedle.trim();
  if (!needle) return "";

  const origLower = original.toLowerCase().replace(/ё/g, "е");
  const needleLower = needle.replace(/ё/g, "е");
  const idx = origLower.indexOf(needleLower);
  if (idx >= 0) {
    return original
      .slice(idx, idx + needle.length)
      .replace(/[.!?]+$/g, "")
      .trim();
  }
  return needle;
}

function capitalizeTaskTitle(value: string): string {
  const t = value.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function matchCreateTask(text: string): PatternMatch | null {
  const normalized = normalizeTaskInput(text);
  if (!normalized || NOTE_PREFIX.test(normalized)) return null;

  for (const { re, pick } of CREATE_TASK_PATTERNS) {
    const m = normalized.match(re);
    if (!m) continue;
    const picked = pick(m);
    if (picked?.titleNorm.trim()) return picked;
  }
  return null;
}

/**
 * Детерминированный разбор «поставь задачу …» без LLM.
 */
export function parseCreateTaskQuery(
  text: string,
): Extract<AiIntent, { intent: "create_task" }> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const matched = matchCreateTask(trimmed);
  if (!matched) return null;

  let titleNorm = stripTitleFillers(matched.titleNorm);
  if (!titleNorm) return null;

  const deadlineDate = resolveDeadlineFromUserMessage(trimmed) ?? undefined;
  titleNorm = stripDeadlineMarkersFromText(titleNorm) ?? titleNorm;

  let title = extractPreservingCase(trimmed, titleNorm);
  title = capitalizeTaskTitle(title);
  if (!title) return null;

  const payload: Extract<AiIntent, { intent: "create_task" }>["payload"] = { title };
  if (deadlineDate) payload.deadlineDate = deadlineDate;

  if (createTaskTextHasSelfAssigneeMarker(trimmed)) {
    payload.assigneeHint = SELF_HINT_MARKER;
  } else if (matched.assigneeNorm) {
    payload.assigneeHint = extractPreservingCase(trimmed, matched.assigneeNorm);
  }

  return {
    intent: "create_task",
    confidence: 0.92,
    requiresConfirmation: true,
    payload,
  };
}
