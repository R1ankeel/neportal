import { getActiveChoice } from "../choice-state";
import { getPendingAbsenceDelegation } from "../pending-absence-delegation";
import { getPendingConfirmation } from "../pending-intent";
import { getPendingConfirmationEdit } from "../pending-confirmation-edit";
import { getPendingTaskTransferDecision } from "../pending-task-transfer-decision";
import { getPendingTaskTransferRejection } from "../pending-task-transfer-rejection";
import { getPendingCreateTaskAssignee } from "../pending-create-task-assignee";
import { getPendingExpenseReceiptUpload } from "../pending-expense-receipt-upload";

export type VoicePendingGuardOptions = {
  allowCreateTaskAssigneeInput?: boolean;
};

export function hasBlockingPendingState(
  telegramUserId: number,
  opts?: VoicePendingGuardOptions,
): boolean {
  const pendingEdit = getPendingConfirmationEdit(telegramUserId);
  if (getPendingConfirmation(telegramUserId) && !pendingEdit) return true;
  const activeChoice = getActiveChoice(telegramUserId);
  if (
    activeChoice &&
    !(opts?.allowCreateTaskAssigneeInput && activeChoice.kind === "create_task_assignee")
  ) {
    return true;
  }
  if (getPendingTaskTransferDecision(telegramUserId)) return true;
  if (getPendingTaskTransferRejection(telegramUserId)) return true;
  if (!opts?.allowCreateTaskAssigneeInput && getPendingCreateTaskAssignee(telegramUserId)) {
    return true;
  }
  if (getPendingAbsenceDelegation(telegramUserId)) return true;
  if (getPendingExpenseReceiptUpload(telegramUserId)) return true;
  return false;
}
