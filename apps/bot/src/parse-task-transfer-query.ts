import type { AiIntent } from "./ai-contracts";

export type TaskTransferLikeIntent = Extract<
  AiIntent,
  { intent: "transfer_task" } | { intent: "reassign_task" }
>;

function normalizeTransferInput(text: string): string {
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

function capitalizeName(value: string): string {
  const t = value.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

type ParsedTransfer = {
  taskTitleNorm: string;
  toUserNorm: string;
  fromUserNorm?: string;
};

const REASSIGN_FROM_TO_RE =
  /^(?:перекинь|перенеси|переназначь)(?:те)?\s+задачу\s+(.+?)\s+с\s+(\p{L}+(?:\s+\p{L}+)?)\s+на\s+(\p{L}+(?:\s+\p{L}+)?)$/iu;

const TASK_ON_USER_RE =
  /^(?:перекинь|перенеси|переназначь|передай)(?:те)?\s+задачу\s+(.+?)\s+на\s+(\p{L}+(?:\s+\p{L}+)?)$/iu;

const TASK_TO_USER_RE =
  /^(?:передай)(?:те)?\s+задачу\s+(.+?)\s+(\p{L}+(?:\s+\p{L}+)?)$/iu;

function matchTransfer(normalized: string): ParsedTransfer | null {
  const fromTo = normalized.match(REASSIGN_FROM_TO_RE);
  if (fromTo?.[1] && fromTo[2] && fromTo[3]) {
    return {
      taskTitleNorm: fromTo[1].trim(),
      fromUserNorm: fromTo[2].trim(),
      toUserNorm: fromTo[3].trim(),
    };
  }

  const onUser = normalized.match(TASK_ON_USER_RE);
  if (onUser?.[1] && onUser[2]) {
    return {
      taskTitleNorm: onUser[1].trim(),
      toUserNorm: onUser[2].trim(),
    };
  }

  const toUser = normalized.match(TASK_TO_USER_RE);
  if (toUser?.[1] && toUser[2]) {
    return {
      taskTitleNorm: toUser[1].trim(),
      toUserNorm: toUser[2].trim(),
    };
  }

  return null;
}

/**
 * Детерминированный разбор «перекинь задачу … на Ивана» до YandexGPT.
 * preferReassign: true для OWNER/MANAGER → reassign_task, иначе transfer_task.
 */
export function parseTaskTransferLikeQuery(
  text: string,
  options?: { preferReassign?: boolean },
): TaskTransferLikeIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const normalized = normalizeTransferInput(trimmed);
  const parsed = matchTransfer(normalized);
  if (!parsed?.taskTitleNorm || !parsed.toUserNorm) return null;

  const taskTitle = extractPreservingCase(trimmed, parsed.taskTitleNorm);
  const toUserHint = capitalizeName(extractPreservingCase(trimmed, parsed.toUserNorm));
  if (!taskTitle || !toUserHint) return null;

  const preferReassign = options?.preferReassign === true;
  const hasFrom = Boolean(parsed.fromUserNorm?.trim());

  if (hasFrom || preferReassign) {
    const payload: Extract<AiIntent, { intent: "reassign_task" }>["payload"] = {
      taskTitle,
      toUserHint,
    };
    if (parsed.fromUserNorm) {
      payload.fromUserHint = capitalizeName(
        extractPreservingCase(trimmed, parsed.fromUserNorm),
      );
    }
    return {
      intent: "reassign_task",
      confidence: 0.93,
      requiresConfirmation: true,
      payload,
    };
  }

  return {
    intent: "transfer_task",
    confidence: 0.93,
    requiresConfirmation: true,
    payload: {
      taskTitle,
      toUserHint,
    },
  };
}
