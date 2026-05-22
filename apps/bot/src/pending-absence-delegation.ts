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

export type AbsenceDelegationTaskItem = {
  id: string;
  title: string;
  deadlineAt: string | null;
  status: string;
  projectName: string | null;
  creatorId: string;
  creatorName: string;
};

export type PendingAbsenceDelegationTaskSelection = {
  type: "awaiting_absence_delegation_task_selection";
  absenceId: string;
  absenceUserId: string;
  absenceUserName: string;
  absenceType: "SICK_LEAVE" | "VACATION";
  startDate: string;
  endDate: string;
  tasks: AbsenceDelegationTaskItem[];
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
  selectedTaskIds: string[];
  selectedTasks: AbsenceDelegationTaskItem[];
  createdAt: number;
};

export type PendingAbsenceDelegation =
  | PendingAbsenceDelegationTaskSelection
  | PendingAbsenceDelegationAssignee;

const pendingByTelegramUserId = new Map<number, PendingAbsenceDelegation>();

export const PENDING_ABSENCE_DELEGATION_TTL_MS = 30 * 60 * 1000;

export function hasPendingAbsenceDelegation(telegramUserId: number): boolean {
  return pendingByTelegramUserId.has(telegramUserId);
}

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

export function startPendingAbsenceDelegationTaskSelection(
  telegramUserId: number,
  pending: Omit<PendingAbsenceDelegationTaskSelection, "type" | "createdAt">,
): void {
  clearOtherPendings(telegramUserId);
  setPendingAbsenceDelegation(telegramUserId, {
    type: "awaiting_absence_delegation_task_selection",
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
