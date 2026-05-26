import { getActiveChoice } from "../choice-state";
import { getPendingAbsenceDelegation } from "../pending-absence-delegation";
import { getPendingConfirmation } from "../pending-intent";
import { getPendingTaskCommentDetails } from "../pending-task-comment-details";
import { getPendingTaskMentionDetails } from "../pending-task-mention-details";
import { getPendingTaskStatusDetails } from "../pending-task-status-details";
import { getPendingTaskTransferComment } from "../pending-task-transfer-comment";
import { getPendingTaskTransferDecision } from "../pending-task-transfer-decision";
import { getPendingTaskTransferRejection } from "../pending-task-transfer-rejection";
import { getPendingCreateTaskAssignee } from "../pending-create-task-assignee";
import { getPendingExpenseReceiptUpload } from "../pending-expense-receipt-upload";

export function hasBlockingPendingState(telegramUserId: number): boolean {
  if (getPendingConfirmation(telegramUserId)) return true;
  if (getActiveChoice(telegramUserId)) return true;
  if (getPendingTaskStatusDetails(telegramUserId)) return true;
  if (getPendingTaskCommentDetails(telegramUserId)) return true;
  if (getPendingTaskMentionDetails(telegramUserId)) return true;
  if (getPendingTaskTransferComment(telegramUserId)) return true;
  if (getPendingTaskTransferDecision(telegramUserId)) return true;
  if (getPendingTaskTransferRejection(telegramUserId)) return true;
  if (getPendingCreateTaskAssignee(telegramUserId)) return true;
  if (getPendingAbsenceDelegation(telegramUserId)) return true;
  if (getPendingExpenseReceiptUpload(telegramUserId)) return true;
  return false;
}

