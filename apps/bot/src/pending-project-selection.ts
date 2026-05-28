import type { AiIntent } from "./ai-contracts";
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
import { clearPendingBudgetSelection } from "./pending-budget-selection";
import { clearPendingExpenseReceiptSelection } from "./pending-expense-receipt-selection";
import { clearPendingExpenseReceiptUpload } from "./pending-expense-receipt-upload";
import { createChoiceId } from "./choice-id";
import type { PendingCreateTaskAssignee } from "./pending-create-task-assignee";

export type ProjectCandidate = {
  id: string;
  name: string;
};

export type ProjectSelectionContinue =
  | { kind: "ai_intent"; intent: AiIntent; userText?: string }
  | {
      kind: "create_task_assignee";
      data: Omit<PendingCreateTaskAssignee, "type" | "choiceId" | "createdAt">;
    }
  | {
      kind: "slash_task";
      title: string;
      creatorId: string;
      assigneeId?: string;
    }
  | {
      kind: "slash_expense";
      amount: number;
      description?: string;
      budgetHint?: string;
      executeIfResolved?: boolean;
    };

export type PendingProjectSelection = {
  choiceId: string;
  type: "select_project";
  candidates: ProjectCandidate[];
  truncated: boolean;
  continue: ProjectSelectionContinue;
  createdAt: number;
};

const pendingByTelegramUserId = new Map<number, PendingProjectSelection>();

export const PENDING_PROJECT_SELECTION_TTL_MS = 30 * 60 * 1000;

export function getPendingProjectSelection(
  telegramUserId: number,
): PendingProjectSelection | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function clearPendingProjectSelection(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}

export function isPendingProjectSelectionExpired(pending: PendingProjectSelection): boolean {
  return Date.now() - pending.createdAt > PENDING_PROJECT_SELECTION_TTL_MS;
}

export function startPendingProjectSelection(
  telegramUserId: number,
  pending: Omit<PendingProjectSelection, "choiceId" | "type" | "createdAt">,
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
  clearPendingBudgetSelection(telegramUserId);
  clearPendingExpenseReceiptSelection(telegramUserId);
  clearPendingExpenseReceiptUpload(telegramUserId);

  pendingByTelegramUserId.set(telegramUserId, {
    type: "select_project",
    ...pending,
    choiceId: createChoiceId(),
    createdAt: Date.now(),
  });
}

export function hasPendingProjectSelection(telegramUserId: number): boolean {
  return pendingByTelegramUserId.has(telegramUserId);
}
