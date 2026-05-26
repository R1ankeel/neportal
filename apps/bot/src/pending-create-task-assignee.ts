import { clearPendingConfirmation } from "./pending-intent";
import { clearPendingTaskCommentDetails } from "./pending-task-comment-details";
import { clearPendingTaskMentionDetails } from "./pending-task-mention-details";
import { clearPendingTaskSelection } from "./pending-task-selection";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import { clearPendingTaskTransferComment } from "./pending-task-transfer-comment";
import { clearPendingTaskTransferDecision } from "./pending-task-transfer-decision";
import { clearPendingTaskTransferRejection } from "./pending-task-transfer-rejection";
import { clearPendingUserSelection } from "./pending-user-selection";
import { clearPendingBudgetSelection } from "./pending-budget-selection";
import { createChoiceId } from "./choice-id";

export type CreateTaskAssigneeCandidate =
  | { kind: "self" }
  | { kind: "user"; userId: string; label: string };

export type PendingCreateTaskAssignee = {
  type: "awaiting_create_task_assignee";
  choiceId: string;
  candidates: CreateTaskAssigneeCandidate[];
  projectHint?: string;
  title: string;
  description?: string;
  deadlineDate?: string;
  creatorId: string;
  createdAt: number;
};

const pendingByTelegramUserId = new Map<number, PendingCreateTaskAssignee>();

export const PENDING_CREATE_TASK_ASSIGNEE_TTL_MS = 30 * 60 * 1000;

export function getPendingCreateTaskAssignee(
  telegramUserId: number,
): PendingCreateTaskAssignee | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function setPendingCreateTaskAssignee(
  telegramUserId: number,
  pending: PendingCreateTaskAssignee,
): void {
  pendingByTelegramUserId.set(telegramUserId, {
    ...pending,
    choiceId: pending.choiceId || createChoiceId(),
  });
}

export function clearPendingCreateTaskAssignee(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}

export function isPendingCreateTaskAssigneeExpired(
  pending: PendingCreateTaskAssignee,
): boolean {
  return Date.now() - pending.createdAt > PENDING_CREATE_TASK_ASSIGNEE_TTL_MS;
}

/** Сбросить другие pending и сохранить ожидание исполнителя для create_task. */
export function startPendingCreateTaskAssignee(
  telegramUserId: number,
  data: Omit<PendingCreateTaskAssignee, "type" | "createdAt" | "choiceId">,
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
  clearPendingBudgetSelection(telegramUserId);
  setPendingCreateTaskAssignee(telegramUserId, {
    type: "awaiting_create_task_assignee",
    ...data,
    choiceId: createChoiceId(),
    createdAt: Date.now(),
  });
}
