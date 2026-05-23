import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser, UserNameMatchResult } from "./api";
import { todayIsoDate } from "./parse-ru-date";
import {
  apiUserToCandidate,
  startPendingUserSelection,
  type PendingUserSelectionType,
  type UserSelectionPayload,
} from "./pending-user-selection";
import {
  isResolvableNamedUserHint,
  sanitizeAiUserHint,
} from "./fix-ai-intent-absence-user";
import { isSelfHint, resolveUsersByHint, SELF_HINT_MARKER } from "./resolve-users-by-hint";

function isAssigneeSelfHint(hint: string): boolean {
  const t = hint.trim();
  return t === SELF_HINT_MARKER || isSelfHint(t);
}
import { formatUserCandidates, userNotFoundMessage } from "./user-selection-format";

export function resolveUserByHint(
  users: ApiUser[],
  hint: string,
  currentUser: ApiUser | null,
): UserNameMatchResult {
  return resolveUsersByHint(users, hint, currentUser);
}

export type UserHintResolution =
  | { status: "no_hint" }
  | { status: "resolved"; user: ApiUser }
  | { status: "not_found"; hint: string }
  | { status: "selection_started" };

export async function resolveUserHintWithSelection(
  ctx: Context,
  telegramUserId: number,
  users: ApiUser[],
  hint: string,
  currentUser: ApiUser,
  selectionType: PendingUserSelectionType,
  payload: UserSelectionPayload,
): Promise<UserHintResolution> {
  const trimmed = hint.trim();
  if (!trimmed) return { status: "no_hint" };

  const match = resolveUsersByHint(users, trimmed, currentUser);
  if (match.kind === "one") {
    return { status: "resolved", user: match.user };
  }
  if (match.kind === "none") {
    await ctx.reply(userNotFoundMessage(trimmed));
    return { status: "not_found", hint: trimmed };
  }

  startPendingUserSelection(
    telegramUserId,
    selectionType,
    match.users.map(apiUserToCandidate),
    payload,
  );
  await ctx.reply(formatUserCandidates(match.users.map(apiUserToCandidate)));
  return { status: "selection_started" };
}

/** Подсказка для AI: __self__ или разговорные местоимения. */
export function normalizeAiUserHint(hint: string | undefined): string | undefined {
  if (!hint?.trim()) return hint;
  const t = hint.trim();
  if (t === SELF_HINT_MARKER) return t;
  return t;
}

export function extractUserHintFromIntent(intent: AiIntent): string | undefined {
  let raw: string | undefined;
  switch (intent.intent) {
    case "create_task":
      raw = intent.payload.assigneeHint;
      break;
    case "create_absence":
    case "cancel_absence":
      raw = intent.payload.userHint;
      break;
    case "mention_in_task":
      raw = intent.payload.userHint;
      break;
    case "transfer_task":
      raw = intent.payload.toUserHint;
      break;
    case "reassign_task":
      raw = intent.payload.toUserHint;
      break;
    case "list_user_tasks":
      raw = intent.payload.userHint;
      break;
    default:
      return undefined;
  }
  return sanitizeAiUserHint(raw);
}

export type PendingUserSelectionTypeForIntent = PendingUserSelectionType;

export function selectionTypeForIntent(intent: AiIntent): PendingUserSelectionType | null {
  switch (intent.intent) {
    case "create_task":
      return "select_user_for_task_assignee";
    case "create_absence":
      return "select_user_for_absence";
    case "cancel_absence":
      return "select_user_for_absence_cancel";
    case "mention_in_task":
      return "select_user_for_mention";
    case "transfer_task":
      return "select_user_for_transfer";
    case "reassign_task":
      return "select_user_for_reassign_to";
    default:
      return null;
  }
}

export function buildUserSelectionPayload(
  intent: AiIntent,
  currentUser: ApiUser,
): UserSelectionPayload | null {
  switch (intent.intent) {
    case "create_task":
      return {
        intent: "create_task",
        projectHint: intent.payload.projectHint,
        title: intent.payload.title,
        description: intent.payload.description,
        deadlineDate: intent.payload.deadlineDate,
        creatorId: currentUser.id,
      };
    case "create_absence":
      return {
        intent: "create_absence",
        type: intent.payload.type,
        startDate: intent.payload.startDate ?? todayIsoDate(),
        endDate: intent.payload.endDate,
        documentNumber: intent.payload.documentNumber,
        comment: intent.payload.comment,
      };
    case "cancel_absence":
      return {
        intent: "cancel_absence",
        type: intent.payload.type,
        cancellationReason: intent.payload.cancellationReason,
      };
    case "mention_in_task":
      return {
        intent: "mention_in_task",
        taskTitle: intent.payload.taskTitle,
        text: intent.payload.text,
        aiIntentPayload: intent.payload as Record<string, unknown>,
      };
    case "transfer_task":
      return {
        intent: "transfer_task",
        taskTitle: intent.payload.taskTitle,
        comment: intent.payload.comment,
        aiIntentPayload: intent.payload as Record<string, unknown>,
      };
    case "reassign_task":
      return {
        intent: "reassign_task",
        taskTitle: intent.payload.taskTitle,
        comment: intent.payload.comment,
        toUserHint: intent.payload.toUserHint,
        fromUserId: undefined,
        fromUserName: undefined,
        aiIntentPayload: intent.payload as Record<string, unknown>,
      };
    default:
      return null;
  }
}

/**
 * Если в intent есть user hint и найдено несколько сотрудников — запускает выбор.
 * Возвращает true, если сообщение обработано (выбор или «не найден»).
 */
export async function tryHandleAmbiguousUserHintBeforeResolve(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
  users: ApiUser[],
): Promise<boolean> {
  const hint = extractUserHintFromIntent(intent);
  if (!isResolvableNamedUserHint(hint)) return false;

  if (isAssigneeSelfHint(hint)) {
    return false;
  }

  const selectionType = selectionTypeForIntent(intent);
  const payload = buildUserSelectionPayload(intent, linked);
  if (!selectionType || !payload) return false;

  const result = await resolveUserHintWithSelection(
    ctx,
    telegramUserId,
    users,
    hint,
    linked,
    selectionType,
    payload,
  );

  return result.status === "selection_started" || result.status === "not_found";
}
