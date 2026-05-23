import type { ApiTask } from "./api";
import { clearPendingConfirmation } from "./pending-intent";
import { clearPendingTaskCommentDetails } from "./pending-task-comment-details";
import { clearPendingTaskMentionDetails } from "./pending-task-mention-details";
import { clearPendingTaskTransferComment } from "./pending-task-transfer-comment";
import { clearPendingTaskTransferDecision } from "./pending-task-transfer-decision";
import { clearPendingTaskTransferRejection } from "./pending-task-transfer-rejection";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import { clearPendingUserSelection } from "./pending-user-selection";
import { clearPendingCreateTaskAssignee } from "./pending-create-task-assignee";
import { clearPendingAbsenceSelection } from "./pending-absence-selection";

export type PendingTaskSelectionType =
  | "select_task_for_complete"
  | "select_task_for_cancel"
  | "select_task_for_start"
  | "select_task_for_deadline"
  | "select_task_for_comment"
  | "select_task_for_mention"
  | "select_task_for_transfer";

export type TaskSelectionPayload = {
  completionResult?: string;
  cancellationReason?: string;
  deadlineDate?: string;
  deadlineAt?: string;
  commentText?: string;
  mentionedUserId?: string;
  mentionedUserName?: string;
  mentionText?: string;
  toUserId?: string;
  toUserName?: string;
  transferComment?: string;
};

export type TaskCandidate = {
  id: string;
  title: string;
  status: string;
  deadlineAt: string | null;
  creatorId: string;
  assigneeId: string | null;
  project?: { id: string; name: string } | null;
  assignee?: { id: string; fullName: string } | null;
  creator?: { id: string; fullName: string } | null;
};

export type PendingTaskSelection = {
  type: PendingTaskSelectionType;
  candidates: TaskCandidate[];
  payload: TaskSelectionPayload;
  createdAt: number;
};

const pendingSelectionByTelegramUserId = new Map<number, PendingTaskSelection>();

export const PENDING_TASK_SELECTION_TTL_MS = 30 * 60 * 1000;

export function apiTaskToCandidate(task: ApiTask): TaskCandidate {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    deadlineAt: task.deadlineAt,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    project: task.project ?? null,
    assignee: task.assignee ?? null,
    creator: task.creator ?? null,
  };
}

export function candidateToApiTask(candidate: TaskCandidate): ApiTask {
  return {
    id: candidate.id,
    title: candidate.title,
    status: candidate.status,
    deadlineAt: candidate.deadlineAt,
    creatorId: candidate.creatorId,
    assigneeId: candidate.assigneeId,
    project: candidate.project,
    assignee: candidate.assignee,
    creator: candidate.creator,
  };
}

export function getPendingTaskSelection(
  telegramUserId: number,
): PendingTaskSelection | undefined {
  return pendingSelectionByTelegramUserId.get(telegramUserId);
}

export function setPendingTaskSelection(
  telegramUserId: number,
  pending: PendingTaskSelection,
): void {
  pendingSelectionByTelegramUserId.set(telegramUserId, pending);
}

export function clearPendingTaskSelection(telegramUserId: number): void {
  pendingSelectionByTelegramUserId.delete(telegramUserId);
}

export function isPendingTaskSelectionExpired(pending: PendingTaskSelection): boolean {
  return Date.now() - pending.createdAt > PENDING_TASK_SELECTION_TTL_MS;
}

/** Сбросить другие pending и сохранить выбор задачи. */
export function startPendingTaskSelection(
  telegramUserId: number,
  type: PendingTaskSelectionType,
  candidates: TaskCandidate[],
  payload: TaskSelectionPayload,
): void {
  clearPendingConfirmation(telegramUserId);
  clearPendingTaskStatusDetails(telegramUserId);
  clearPendingTaskCommentDetails(telegramUserId);
  clearPendingTaskMentionDetails(telegramUserId);
  clearPendingTaskTransferComment(telegramUserId);
  clearPendingTaskTransferDecision(telegramUserId);
  clearPendingTaskTransferRejection(telegramUserId);
  clearPendingUserSelection(telegramUserId);
  clearPendingCreateTaskAssignee(telegramUserId);
  clearPendingAbsenceSelection(telegramUserId);
  setPendingTaskSelection(telegramUserId, {
    type,
    candidates,
    payload,
    createdAt: Date.now(),
  });
}
