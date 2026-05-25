import { clearPendingConfirmation } from "./pending-intent";
import { clearPendingExpenseReceiptUpload } from "./pending-expense-receipt-upload";
import { clearPendingAbsenceDelegation } from "./pending-absence-delegation";
import { clearPendingAbsenceSelection } from "./pending-absence-selection";
import { clearPendingBudgetSelection } from "./pending-budget-selection";
import { clearPendingCreateTaskAssignee } from "./pending-create-task-assignee";
import { clearPendingTaskCommentDetails } from "./pending-task-comment-details";
import { clearPendingTaskMentionDetails } from "./pending-task-mention-details";
import { clearPendingTaskSelection } from "./pending-task-selection";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import { clearPendingTaskTransferComment } from "./pending-task-transfer-comment";
import { clearPendingTaskTransferDecision } from "./pending-task-transfer-decision";
import { clearPendingTaskTransferRejection } from "./pending-task-transfer-rejection";
import { clearPendingUserSelection } from "./pending-user-selection";
import { createChoiceId } from "./choice-id";

export type PendingExpenseCandidate = {
  id: string;
  amount: number;
  description: string | null;
  createdAt: string;
  budgetName: string;
  projectName: string;
};

export type PendingExpenseReceiptSelection = {
  choiceId: string;
  expenses: PendingExpenseCandidate[];
  createdAt: number;
};

const pendingByTelegramUserId = new Map<number, PendingExpenseReceiptSelection>();

export const PENDING_EXPENSE_RECEIPT_SELECTION_TTL_MS = 30 * 60 * 1000;

export function getPendingExpenseReceiptSelection(
  telegramUserId: number,
): PendingExpenseReceiptSelection | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function clearPendingExpenseReceiptSelection(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}

export function isPendingExpenseReceiptSelectionExpired(
  pending: PendingExpenseReceiptSelection,
): boolean {
  return Date.now() - pending.createdAt > PENDING_EXPENSE_RECEIPT_SELECTION_TTL_MS;
}

function clearOtherPendingStates(telegramUserId: number): void {
  clearPendingConfirmation(telegramUserId);
  clearPendingExpenseReceiptUpload(telegramUserId);
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
  clearPendingBudgetSelection(telegramUserId);
}

export function startPendingExpenseReceiptSelection(
  telegramUserId: number,
  expenses: PendingExpenseCandidate[],
): void {
  clearOtherPendingStates(telegramUserId);
  pendingByTelegramUserId.set(telegramUserId, {
    choiceId: createChoiceId(),
    expenses,
    createdAt: Date.now(),
  });
}
