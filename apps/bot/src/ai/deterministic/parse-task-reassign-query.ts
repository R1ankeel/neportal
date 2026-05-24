import type { AiIntent } from "../../ai-contracts";
import { normalizeTaskSearchText, tokenizeForTaskMatch } from "../../task-search-text";
import type { ApiUser } from "../../api";
import {
  deterministicParseTransferCommand,
  type ParsedTransferParts,
} from "../../transfer-query-parse";

export type TaskReassignLikeIntent = Extract<
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

function preferReassign(role?: string): boolean {
  if (!role) return true;
  const r = role.toUpperCase();
  return r === "OWNER" || r === "MANAGER";
}

function buildIntent(
  trimmed: string,
  parts: ParsedTransferParts,
  options: { useReassign: boolean; comment?: string },
): TaskReassignLikeIntent | null {
  const taskTitleRaw = extractPreservingCase(trimmed, parts.taskTitleNorm);
  const taskTitle = cleanTaskTitleFromReassignPhrase(taskTitleRaw);
  if (!taskTitle) return null;

  const comment = options.comment?.trim();
  const commentField = comment ? { comment } : {};

  if (parts.toSelf) {
    const payload: Extract<AiIntent, { intent: "reassign_task" }>["payload"] = {
      taskTitle,
      toUserHint: "__self__",
      ...commentField,
    };
    if (parts.fromUserNorm) {
      payload.fromUserHint = capitalizeHint(
        extractPreservingCase(trimmed, parts.fromUserNorm),
      );
    }
    return {
      intent: "reassign_task",
      confidence: 0.95,
      requiresConfirmation: true,
      payload,
    };
  }

  if (!parts.toUserNorm) return null;

  const toUserHint = capitalizeHint(extractPreservingCase(trimmed, parts.toUserNorm));
  if (!toUserHint) return null;

  if (parts.fromUserNorm || options.useReassign) {
    const payload: Extract<AiIntent, { intent: "reassign_task" }>["payload"] = {
      taskTitle,
      toUserHint,
      ...commentField,
    };
    if (parts.fromUserNorm) {
      payload.fromUserHint = capitalizeHint(
        extractPreservingCase(trimmed, parts.fromUserNorm),
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
      ...commentField,
    },
  };
}

/**
 * Детерминированный разбор переназначения/передачи задачи до YandexGPT.
 */
export function parseTaskReassignQuery(
  text: string,
  currentUserRole?: string,
  options?: { users?: ApiUser[]; currentUser?: ApiUser | null },
): TaskReassignLikeIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (!options?.users?.length) {
    return null;
  }

  const deterministic = deterministicParseTransferCommand(trimmed, {
    users: options.users,
    currentUser: options.currentUser ?? null,
  });
  if (!deterministic) return null;

  return buildIntent(trimmed, deterministic.parts, {
    useReassign: preferReassign(currentUserRole) || Boolean(deterministic.parts.fromUserNorm),
    comment: deterministic.comment,
  });
}
