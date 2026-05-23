import { clearPendingConfirmation } from "./pending-intent";
import { clearPendingExpenseReceiptSelection } from "./pending-expense-receipt-selection";
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

export type PendingExpenseReceiptUpload = {
  expenseId: string;
  amount: number;
  description: string;
  budgetName: string;
  uploadedById: string;
  createdAt: number;
};

const pendingByTelegramUserId = new Map<number, PendingExpenseReceiptUpload>();

export const PENDING_EXPENSE_RECEIPT_UPLOAD_TTL_MS = 30 * 60 * 1000;

export function getPendingExpenseReceiptUpload(
  telegramUserId: number,
): PendingExpenseReceiptUpload | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function clearPendingExpenseReceiptUpload(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}

export function isPendingExpenseReceiptUploadExpired(
  pending: PendingExpenseReceiptUpload,
): boolean {
  return Date.now() - pending.createdAt > PENDING_EXPENSE_RECEIPT_UPLOAD_TTL_MS;
}

function clearOtherPendingStates(telegramUserId: number): void {
  clearPendingConfirmation(telegramUserId);
  clearPendingExpenseReceiptSelection(telegramUserId);
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

export function startPendingExpenseReceiptUpload(
  telegramUserId: number,
  pending: Omit<PendingExpenseReceiptUpload, "createdAt">,
): void {
  clearOtherPendingStates(telegramUserId);
  pendingByTelegramUserId.set(telegramUserId, {
    ...pending,
    createdAt: Date.now(),
  });
}
