import { clearPendingConfirmation } from "./pending-intent";
import { clearPendingTaskCommentDetails } from "./pending-task-comment-details";
import { clearPendingTaskMentionDetails } from "./pending-task-mention-details";
import { clearPendingTaskSelection } from "./pending-task-selection";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import { clearPendingTaskTransferComment } from "./pending-task-transfer-comment";
import { clearPendingTaskTransferDecision } from "./pending-task-transfer-decision";
import { clearPendingTaskTransferRejection } from "./pending-task-transfer-rejection";
import { clearPendingUserSelection } from "./pending-user-selection";
import { clearPendingCreateTaskAssignee } from "./pending-create-task-assignee";
import { clearPendingAbsenceDelegation } from "./pending-absence-delegation";
import { createChoiceId } from "./choice-id";

export type AbsenceCandidate = {
  id: string;
  type: "SICK_LEAVE" | "VACATION";
  startDate: string;
  endDate: string;
  userId: string;
  userFullName: string;
};

export type CancelAbsenceSelectionPayload = {
  cancellationReason?: string;
  cancelledById: string;
};

export type PendingAbsenceSelection = {
  choiceId: string;
  type: "select_absence_for_cancel";
  candidates: AbsenceCandidate[];
  payload: CancelAbsenceSelectionPayload;
  createdAt: number;
};

const pendingAbsenceSelectionByTelegramUserId = new Map<number, PendingAbsenceSelection>();

export const PENDING_ABSENCE_SELECTION_TTL_MS = 30 * 60 * 1000;

export function getPendingAbsenceSelection(
  telegramUserId: number,
): PendingAbsenceSelection | undefined {
  return pendingAbsenceSelectionByTelegramUserId.get(telegramUserId);
}

export function clearPendingAbsenceSelection(telegramUserId: number): void {
  pendingAbsenceSelectionByTelegramUserId.delete(telegramUserId);
}

export function isPendingAbsenceSelectionExpired(pending: PendingAbsenceSelection): boolean {
  return Date.now() - pending.createdAt > PENDING_ABSENCE_SELECTION_TTL_MS;
}

export function startPendingAbsenceSelection(
  telegramUserId: number,
  candidates: AbsenceCandidate[],
  payload: CancelAbsenceSelectionPayload,
): void {
  clearPendingConfirmation(telegramUserId);
  clearPendingTaskSelection(telegramUserId);
  clearPendingTaskStatusDetails(telegramUserId);
  clearPendingTaskCommentDetails(telegramUserId);
  clearPendingTaskMentionDetails(telegramUserId);
  clearPendingTaskTransferComment(telegramUserId);
  clearPendingTaskTransferDecision(telegramUserId);
  clearPendingTaskTransferRejection(telegramUserId);
  clearPendingUserSelection(telegramUserId);
  clearPendingCreateTaskAssignee(telegramUserId);
  clearPendingAbsenceDelegation(telegramUserId);
  pendingAbsenceSelectionByTelegramUserId.set(telegramUserId, {
    choiceId: createChoiceId(),
    type: "select_absence_for_cancel",
    candidates,
    payload,
    createdAt: Date.now(),
  });
}
