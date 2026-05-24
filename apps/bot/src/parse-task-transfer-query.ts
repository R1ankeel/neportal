import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import {
  deterministicParseTransferCommand,
  peelTransferTrailingComment,
} from "./transfer-query-parse";

export type TaskTransferLikeIntent = Extract<
  AiIntent,
  { intent: "transfer_task" } | { intent: "reassign_task" }
>;

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

function buildIntentFromParts(
  trimmed: string,
  parsed: {
    taskTitleNorm: string;
    toUserNorm: string;
    fromUserNorm?: string;
    toSelf?: boolean;
  },
  options: { preferReassign?: boolean; comment?: string },
): TaskTransferLikeIntent | null {
  const taskTitle = extractPreservingCase(trimmed, parsed.taskTitleNorm);
  if (!taskTitle) return null;

  const preferReassign = options.preferReassign === true;
  const hasFrom = Boolean(parsed.fromUserNorm?.trim());

  const comment = options.comment?.trim();
  const commentField = comment ? { comment } : {};

  if (parsed.toSelf) {
    const payload: Extract<AiIntent, { intent: "reassign_task" }>["payload"] = {
      taskTitle,
      toUserHint: "__self__",
      ...commentField,
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

  const toUserHint = capitalizeName(extractPreservingCase(trimmed, parsed.toUserNorm));
  if (!toUserHint) return null;

  if (hasFrom || preferReassign) {
    const payload: Extract<AiIntent, { intent: "reassign_task" }>["payload"] = {
      taskTitle,
      toUserHint,
      ...commentField,
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
      ...commentField,
    },
  };
}

/**
 * Детерминированный разбор «перекинь задачу … на Ивана» до YandexGPT.
 * preferReassign: true для OWNER/MANAGER → reassign_task, иначе transfer_task.
 */
export function parseTaskTransferLikeQuery(
  text: string,
  options?: {
    preferReassign?: boolean;
    users?: ApiUser[];
    currentUser?: ApiUser | null;
  },
): TaskTransferLikeIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const { comment: peeledComment } = peelTransferTrailingComment(trimmed);

  if (options?.users?.length) {
    const deterministic = deterministicParseTransferCommand(trimmed, {
      users: options.users,
      currentUser: options.currentUser ?? null,
    });
    if (deterministic) {
      return buildIntentFromParts(trimmed, deterministic.parts, {
        preferReassign: options.preferReassign,
        comment: deterministic.comment ?? peeledComment,
      });
    }
    return null;
  }

  return null;
}
