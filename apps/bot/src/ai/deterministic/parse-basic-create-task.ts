import { createTaskTextHasSelfAssigneeMarker } from "../../fix-ai-intent-assignee";
import {
  resolveDeadlineFromUserMessage,
  stripDeadlineMarkersFromText,
} from "../../parse-ru-date";
import { SELF_HINT_MARKER } from "../../resolve-users-by-hint";
import {
  extractPreservingCase,
  hasBasicCreateTaskMarker,
  isTooComplexForBasicCreateTask,
  looksLikeBasicAssigneeWord,
  normalizeBasicCreateTaskInput,
  shouldCleanupBasicTaskTitle,
  stripTitleFillers,
} from "./basic-create-task-text";

const NOTE_PREFIX = /^(?:создай|добавь|запиши)(?:те)?\s+заметк/iu;

type PatternMatch = {
  titleNorm: string;
  assigneeNorm?: string;
};

const BASIC_CREATE_TASK_PATTERNS: Array<{
  re: RegExp;
  pick: (m: RegExpMatchArray) => PatternMatch | null;
}> = [
  {
    re: /^(?:создай|поставь|заведи|добавь)(?:те)?\s+(?:задачу|хадачу)\s+(\p{L}+)\s+(\p{L}+)\s+(.+)$/iu,
    pick: (m) =>
      looksLikeBasicAssigneeWord(m[1]!) && looksLikeBasicAssigneeWord(m[2]!)
        ? { assigneeNorm: `${m[1]} ${m[2]}`, titleNorm: m[3]! }
        : null,
  },
  {
    re: /^(?:создай|поставь|заведи|добавь)(?:те)?\s+(?:задачу|хадачу)\s+(\p{L}+)\s+(.+)$/iu,
    pick: (m) =>
      looksLikeBasicAssigneeWord(m[1]!)
        ? { assigneeNorm: m[1]!, titleNorm: m[2]! }
        : null,
  },
  {
    re: /^(?:создай|поставь|заведи|добавь)(?:те)?\s+(?:задачу|хадачу)\s+для\s+(\p{L}+)\s+(.+)$/iu,
    pick: (m) => ({ assigneeNorm: m[1]!, titleNorm: m[2]! }),
  },
  {
    re: /^(?:создай|поставь|заведи|добавь)(?:те)?\s+(?:задачу|хадачу)\s+на\s+(\p{L}+)\s+(.+)$/iu,
    pick: (m) => ({ assigneeNorm: m[1]!, titleNorm: m[2]! }),
  },
  {
    re: /^(?:поставь|создай|добавь)(?:те)?\s+мне\s+(?:задачу|хадачу\s+)?(.+)$/iu,
    pick: (m) => ({ titleNorm: m[1]! }),
  },
];

export type BasicCreateTaskParseResult = {
  intent: "create_task";
  confidence: number;
  requiresConfirmation: true;
  payload: {
    assigneeHint?: string;
    rawTitle: string;
    title: string;
    deadlineDate?: string;
  };
  meta: {
    source: "deterministic_basic_create_task";
    needsCleanup: boolean;
  };
};

export type ParseBasicCreateTaskOptions = {
  textSource?: "text" | "voice";
};

function matchBasicCreateTask(text: string): PatternMatch | null {
  const normalized = normalizeBasicCreateTaskInput(text);
  if (!normalized || NOTE_PREFIX.test(normalized)) return null;
  if (!hasBasicCreateTaskMarker(normalized)) return null;

  for (const { re, pick } of BASIC_CREATE_TASK_PATTERNS) {
    const m = normalized.match(re);
    if (!m) continue;
    const picked = pick(m);
    if (!picked?.titleNorm.trim()) continue;
    if (isTooComplexForBasicCreateTask(text, picked.titleNorm)) return null;
    return picked;
  }
  return null;
}

/**
 * Консервативный разбор коротких «создай задачу …» без LLM.
 * Возвращает rawTitle; финальный title — после cleanup или normalize.
 */
export function parseBasicCreateTask(
  text: string,
  options?: ParseBasicCreateTaskOptions,
): BasicCreateTaskParseResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const matched = matchBasicCreateTask(trimmed);
  if (!matched) return null;

  let titleNorm = stripTitleFillers(matched.titleNorm);
  if (!titleNorm) return null;

  const deadlineDate = resolveDeadlineFromUserMessage(trimmed) ?? undefined;
  titleNorm = stripDeadlineMarkersFromText(titleNorm) ?? titleNorm;

  const rawTitle = extractPreservingCase(trimmed, titleNorm);
  if (!rawTitle.trim()) return null;

  const hasAssignee = Boolean(matched.assigneeNorm) || createTaskTextHasSelfAssigneeMarker(trimmed);
  if (!hasAssignee) return null;

  const needsCleanup = shouldCleanupBasicTaskTitle(rawTitle, options);

  const payload: BasicCreateTaskParseResult["payload"] = {
    rawTitle,
    title: rawTitle,
  };
  if (deadlineDate) payload.deadlineDate = deadlineDate;

  if (createTaskTextHasSelfAssigneeMarker(trimmed)) {
    payload.assigneeHint = SELF_HINT_MARKER;
  } else if (matched.assigneeNorm) {
    payload.assigneeHint = extractPreservingCase(trimmed, matched.assigneeNorm);
  }

  return {
    intent: "create_task",
    confidence: 0.95,
    requiresConfirmation: true,
    payload,
    meta: {
      source: "deterministic_basic_create_task",
      needsCleanup,
    },
  };
}
