import type { ExpenseSelectionPayload } from "./create-expense-flow";
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
import { clearPendingAbsenceSelection } from "./pending-absence-selection";
import { clearPendingAbsenceDelegation } from "./pending-absence-delegation";
import type { BudgetCandidate } from "./budget-resolver";

export type PendingBudgetSelection = {
  type: "select_budget_for_expense";
  candidates: BudgetCandidate[];
  payload: ExpenseSelectionPayload;
  createdAt: number;
};

const pendingByTelegramUserId = new Map<number, PendingBudgetSelection>();

export const PENDING_BUDGET_SELECTION_TTL_MS = 30 * 60 * 1000;

export function getPendingBudgetSelection(telegramUserId: number): PendingBudgetSelection | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function clearPendingBudgetSelection(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}

export function isPendingBudgetSelectionExpired(pending: PendingBudgetSelection): boolean {
  return Date.now() - pending.createdAt > PENDING_BUDGET_SELECTION_TTL_MS;
}

export function startPendingBudgetSelection(
  telegramUserId: number,
  pending: Omit<PendingBudgetSelection, "type" | "createdAt">,
): void {
  clearPendingConfirmation(telegramUserId);
  clearPendingTaskStatusDetails(telegramUserId);
  clearPendingTaskCommentDetails(telegramUserId);
  clearPendingTaskMentionDetails(telegramUserId);
  clearPendingTaskSelection(telegramUserId);
  clearPendingTaskTransferComment(telegramUserId);
  clearPendingTaskTransferDecision(telegramUserId);
  clearPendingTaskTransferRejection(telegramUserId);
  clearPendingUserSelection(telegramUserId);
  clearPendingCreateTaskAssignee(telegramUserId);
  clearPendingAbsenceSelection(telegramUserId);
  clearPendingAbsenceDelegation(telegramUserId);

  pendingByTelegramUserId.set(telegramUserId, {
    type: "select_budget_for_expense",
    ...pending,
    createdAt: Date.now(),
  });
}

export function hasPendingBudgetSelection(telegramUserId: number): boolean {
  return pendingByTelegramUserId.has(telegramUserId);
}
