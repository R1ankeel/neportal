import type { ApiUser } from "./api";
import { clearPendingConfirmation } from "./pending-intent";
import { clearPendingTaskCommentDetails } from "./pending-task-comment-details";
import { clearPendingTaskMentionDetails } from "./pending-task-mention-details";
import { clearPendingTaskSelection } from "./pending-task-selection";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import { clearPendingTaskTransferComment } from "./pending-task-transfer-comment";
import { clearPendingTaskTransferDecision } from "./pending-task-transfer-decision";
import { clearPendingTaskTransferRejection } from "./pending-task-transfer-rejection";

export type PendingUserSelectionType =
  | "select_user_for_task_assignee"
  | "select_user_for_transfer"
  | "select_user_for_mention"
  | "select_user_for_absence"
  | "select_user_for_link"
  | "select_user_for_other";

export type UserCandidate = {
  id: string;
  fullName: string;
  role: string;
  telegramUsername?: string | null;
  telegramId?: string | null;
};

export type CreateTaskUserSelectionPayload = {
  intent: "create_task";
  projectHint?: string;
  title: string;
  description?: string;
  deadlineDate?: string;
  creatorId: string;
};

export type TransferUserSelectionPayload = {
  intent: "transfer_task";
  taskTitle: string;
  comment?: string;
  aiIntentPayload?: Record<string, unknown>;
};

export type MentionUserSelectionPayload = {
  intent: "mention_in_task";
  taskTitle: string;
  text?: string;
  aiIntentPayload?: Record<string, unknown>;
};

export type AbsenceUserSelectionPayload = {
  intent: "create_absence";
  type: "SICK_LEAVE" | "VACATION";
  startDate: string;
  endDate: string;
  documentNumber?: string;
  comment?: string;
};

export type LinkUserSelectionPayload = {
  intent: "link_telegram";
};

export type UserSelectionPayload =
  | CreateTaskUserSelectionPayload
  | TransferUserSelectionPayload
  | MentionUserSelectionPayload
  | AbsenceUserSelectionPayload
  | LinkUserSelectionPayload;

export type PendingUserSelection = {
  type: PendingUserSelectionType;
  candidates: UserCandidate[];
  payload: UserSelectionPayload;
  createdAt: number;
};

const pendingUserSelectionByTelegramUserId = new Map<number, PendingUserSelection>();

export const PENDING_USER_SELECTION_TTL_MS = 30 * 60 * 1000;

export function apiUserToCandidate(user: ApiUser): UserCandidate {
  return {
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    telegramUsername: user.telegramUsername,
    telegramId: user.telegramId,
  };
}

export function getPendingUserSelection(
  telegramUserId: number,
): PendingUserSelection | undefined {
  return pendingUserSelectionByTelegramUserId.get(telegramUserId);
}

export function setPendingUserSelection(
  telegramUserId: number,
  pending: PendingUserSelection,
): void {
  pendingUserSelectionByTelegramUserId.set(telegramUserId, pending);
}

export function clearPendingUserSelection(telegramUserId: number): void {
  pendingUserSelectionByTelegramUserId.delete(telegramUserId);
}

export function isPendingUserSelectionExpired(pending: PendingUserSelection): boolean {
  return Date.now() - pending.createdAt > PENDING_USER_SELECTION_TTL_MS;
}

/** Сбросить другие pending и сохранить выбор сотрудника. */
export function startPendingUserSelection(
  telegramUserId: number,
  type: PendingUserSelectionType,
  candidates: UserCandidate[],
  payload: UserSelectionPayload,
): void {
  clearPendingConfirmation(telegramUserId);
  clearPendingTaskSelection(telegramUserId);
  clearPendingTaskStatusDetails(telegramUserId);
  clearPendingTaskCommentDetails(telegramUserId);
  clearPendingTaskMentionDetails(telegramUserId);
  clearPendingTaskTransferComment(telegramUserId);
  clearPendingTaskTransferDecision(telegramUserId);
  clearPendingTaskTransferRejection(telegramUserId);
  setPendingUserSelection(telegramUserId, {
    type,
    candidates,
    payload,
    createdAt: Date.now(),
  });
}
