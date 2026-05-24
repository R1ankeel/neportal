import type { AiIntent } from "../../ai-contracts";
import { normalizeTaskSearchText, tokenizeForTaskMatch } from "../../task-search-text";
import { SELF_HINT_MARKER } from "../../resolve-users-by-hint";

export type TaskReassignLikeIntent = Extract<
  AiIntent,
  { intent: "transfer_task" } | { intent: "reassign_task" }
>;

function normalizeReassignInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
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

function capitalizeHint(value: string): string {
  const t = value.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function tokenToDisplayWord(token: string): string {
  if (token.endsWith("н") && token.length >= 5) {
    return `${token}ый`;
  }
  return token;
}

/** «по квартальному отчету» → «квартальный отчет». */
export function cleanTaskTitleFromReassignPhrase(taskTitleNorm: string): string {
  const tokens = tokenizeForTaskMatch(taskTitleNorm);
  if (tokens.length > 0) {
    return tokens.map(tokenToDisplayWord).join(" ");
  }
  const cleaned = normalizeTaskSearchText(taskTitleNorm);
  return cleaned || taskTitleNorm.trim();
}

type ParsedReassign = {
  taskTitleNorm: string;
  toUserNorm?: string;
  fromUserNorm?: string;
  toSelf?: boolean;
};

const REASSIGN_FROM_TO_RE =
  /^(?:перекинь|перенеси|переназначь)(?:те)?\s+задачу\s+(.+?)\s+с\s+(\p{L}+(?:\s+\p{L}+)?)\s+на\s+(\p{L}+(?:\s+\p{L}+)?)$/iu;

const SELF_TO_PATTERNS: RegExp[] = [
  /^(?:передай|перекинь|перенеси|переназначь|забери|назначь)(?:те)?\s+мне\s+задачу\s+(.+)$/iu,
  /^(?:передай|перекинь|перенеси|переназначь|забери|назначь)(?:те)?\s+задачу\s+мне\s+(.+)$/iu,
  /^(?:переведи|перекинь|перенеси|переназначь)(?:те)?\s+на\s+меня\s+(.+)$/iu,
  /^(?:переведи|перекинь|перенеси|переназначь)(?:те)?\s+задачу\s+на\s+меня\s+(.+)$/iu,
];

const TASK_ON_USER_RE =
  /^(?:перекинь|перенеси|переназначь|передай)(?:те)?\s+задачу\s+(.+?)\s+на\s+(\p{L}+(?:\s+\p{L}+)?)$/iu;

const TASK_TO_USER_RE =
  /^(?:передай)(?:те)?\s+задачу\s+(.+?)\s+(\p{L}+(?:\s+\p{L}+)?)$/iu;

function matchReassignPhrase(normalized: string): ParsedReassign | null {
  const fromTo = normalized.match(REASSIGN_FROM_TO_RE);
  if (fromTo?.[1] && fromTo[2] && fromTo[3]) {
    return {
      taskTitleNorm: fromTo[1].trim(),
      fromUserNorm: fromTo[2].trim(),
      toUserNorm: fromTo[3].trim(),
    };
  }

  for (const re of SELF_TO_PATTERNS) {
    const m = normalized.match(re);
    if (m?.[1]) {
      return { taskTitleNorm: m[1].trim(), toSelf: true };
    }
  }

  const onUser = normalized.match(TASK_ON_USER_RE);
  if (onUser?.[1] && onUser[2]) {
    const toNorm = onUser[2].trim();
    if (toNorm === "меня" || toNorm === "мне") {
      return { taskTitleNorm: onUser[1].trim(), toSelf: true };
    }
    return {
      taskTitleNorm: onUser[1].trim(),
      toUserNorm: toNorm,
    };
  }

  const toUser = normalized.match(TASK_TO_USER_RE);
  if (toUser?.[1] && toUser[2]) {
    const toNorm = toUser[2].trim();
    if (toNorm === "меня" || toNorm === "мне") {
      return { taskTitleNorm: toUser[1].trim(), toSelf: true };
    }
    return {
      taskTitleNorm: toUser[1].trim(),
      toUserNorm: toNorm,
    };
  }

  return null;
}

function preferReassign(role?: string): boolean {
  if (!role) return true;
  const r = role.toUpperCase();
  return r === "OWNER" || r === "MANAGER";
}

/**
 * Детерминированный разбор переназначения/передачи задачи до YandexGPT.
 */
export function parseTaskReassignQuery(
  text: string,
  currentUserRole?: string,
): TaskReassignLikeIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const normalized = normalizeReassignInput(trimmed);
  const parsed = matchReassignPhrase(normalized);
  if (!parsed?.taskTitleNorm) return null;

  const taskTitleRaw = extractPreservingCase(trimmed, parsed.taskTitleNorm);
  const taskTitle = cleanTaskTitleFromReassignPhrase(taskTitleRaw);
  if (!taskTitle) return null;

  const useReassign = preferReassign(currentUserRole) || Boolean(parsed.fromUserNorm);

  if (parsed.toSelf) {
    const payload: Extract<AiIntent, { intent: "reassign_task" }>["payload"] = {
      taskTitle,
      toUserHint: SELF_HINT_MARKER,
    };
    if (parsed.fromUserNorm) {
      payload.fromUserHint = capitalizeHint(
        extractPreservingCase(trimmed, parsed.fromUserNorm),
      );
    }
    return {
      intent: "reassign_task",
      confidence: 0.95,
      requiresConfirmation: true,
      payload,
    };
  }

  if (!parsed.toUserNorm) return null;

  const toUserHint = capitalizeHint(extractPreservingCase(trimmed, parsed.toUserNorm));
  if (!toUserHint) return null;

  if (parsed.fromUserNorm || useReassign) {
    const payload: Extract<AiIntent, { intent: "reassign_task" }>["payload"] = {
      taskTitle,
      toUserHint,
    };
    if (parsed.fromUserNorm) {
      payload.fromUserHint = capitalizeHint(
        extractPreservingCase(trimmed, parsed.fromUserNorm),
      );
    }
    return {
      intent: "reassign_task",
      confidence: 0.95,
      requiresConfirmation: true,
      payload,
    };
  }

  return {
    intent: "transfer_task",
    confidence: 0.95,
    requiresConfirmation: true,
    payload: {
      taskTitle,
      toUserHint,
    },
  };
}
