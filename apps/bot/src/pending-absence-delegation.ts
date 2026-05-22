import type { ApiAbsenceAffectedTask } from "./api";
import { clearPendingConfirmation } from "./pending-intent";
import { clearPendingTaskCommentDetails } from "./pending-task-comment-details";
import { clearPendingTaskMentionDetails } from "./pending-task-mention-details";
import { clearPendingTaskSelection } from "./pending-task-selection";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import { clearPendingTaskTransferComment } from "./pending-task-transfer-comment";
import { clearPendingTaskTransferDecision } from "./pending-task-transfer-decision";
import { clearPendingTaskTransferRejection } from "./pending-task-transfer-rejection";
import { clearPendingCreateTaskAssignee } from "./pending-create-task-assignee";
import { clearPendingUserSelection } from "./pending-user-selection";

export type PendingAbsenceDelegationOffer = {
  type: "pending_absence_delegation";
  absenceId: string;
  absenceUserId: string;
  absenceUserName: string;
  absenceType: "SICK_LEAVE" | "VACATION";
  startDate: string;
  endDate: string;
  affectedTasks: ApiAbsenceAffectedTask[];
  createdAt: number;
};

export type PendingAbsenceDelegationAssignee = {
  type: "awaiting_absence_delegation_assignee";
  absenceId: string;
  absenceUserId: string;
  absenceUserName: string;
  absenceType: "SICK_LEAVE" | "VACATION";
  startDate: string;
  endDate: string;
  affectedTasks: ApiAbsenceAffectedTask[];
  createdAt: number;
};

export type PendingAbsenceDelegationConfirm = {
  type: "confirm_absence_delegation";
  absenceId: string;
  absenceUserId: string;
  absenceType: "SICK_LEAVE" | "VACATION";
  startDate: string;
  endDate: string;
  affectedTasks: ApiAbsenceAffectedTask[];
  toUserId: string;
  toUserName: string;
  toUserTelegramId: string | null;
  createdAt: number;
};

export type PendingAbsenceDelegation =
  | PendingAbsenceDelegationOffer
  | PendingAbsenceDelegationAssignee
  | PendingAbsenceDelegationConfirm;

const pendingByTelegramUserId = new Map<number, PendingAbsenceDelegation>();

export const PENDING_ABSENCE_DELEGATION_TTL_MS = 30 * 60 * 1000;

export function getPendingAbsenceDelegation(
  telegramUserId: number,
): PendingAbsenceDelegation | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function setPendingAbsenceDelegation(
  telegramUserId: number,
  pending: PendingAbsenceDelegation,
): void {
  pendingByTelegramUserId.set(telegramUserId, pending);
}

export function clearPendingAbsenceDelegation(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}

export function isPendingAbsenceDelegationExpired(pending: PendingAbsenceDelegation): boolean {
  return Date.now() - pending.createdAt > PENDING_ABSENCE_DELEGATION_TTL_MS;
}

function clearOtherPendings(telegramUserId: number): void {
  clearPendingConfirmation(telegramUserId);
  clearPendingTaskSelection(telegramUserId);
  clearPendingTaskStatusDetails(telegramUserId);
  clearPendingTaskCommentDetails(telegramUserId);
  clearPendingTaskMentionDetails(telegramUserId);
  clearPendingTaskTransferComment(telegramUserId);
  clearPendingTaskTransferDecision(telegramUserId);
  clearPendingTaskTransferRejection(telegramUserId);
  clearPendingCreateTaskAssignee(telegramUserId);
  clearPendingUserSelection(telegramUserId);
}

export function startPendingAbsenceDelegationOffer(
  telegramUserId: number,
  pending: Omit<PendingAbsenceDelegationOffer, "type" | "createdAt">,
): void {
  clearOtherPendings(telegramUserId);
  setPendingAbsenceDelegation(telegramUserId, {
    type: "pending_absence_delegation",
    ...pending,
    createdAt: Date.now(),
  });
}

export function startPendingAbsenceDelegationAssignee(
  telegramUserId: number,
  pending: Omit<PendingAbsenceDelegationAssignee, "type" | "createdAt">,
): void {
  clearOtherPendings(telegramUserId);
  setPendingAbsenceDelegation(telegramUserId, {
    type: "awaiting_absence_delegation_assignee",
    ...pending,
    createdAt: Date.now(),
  });
}

export function startPendingAbsenceDelegationConfirm(
  telegramUserId: number,
  pending: Omit<PendingAbsenceDelegationConfirm, "type" | "createdAt">,
): void {
  clearOtherPendings(telegramUserId);
  setPendingAbsenceDelegation(telegramUserId, {
    type: "confirm_absence_delegation",
    ...pending,
    createdAt: Date.now(),
  });
}
