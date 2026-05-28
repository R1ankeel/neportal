import type { ApiUser } from "./api";
import { clearPendingConfirmation } from "./pending-intent";
import { clearPendingTaskCommentDetails } from "./pending-task-comment-details";
import { clearPendingTaskMentionDetails } from "./pending-task-mention-details";
import { clearPendingTaskSelection } from "./pending-task-selection";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import { clearPendingTaskTransferComment } from "./pending-task-transfer-comment";
import { clearPendingTaskTransferDecision } from "./pending-task-transfer-decision";
import { clearPendingTaskTransferRejection } from "./pending-task-transfer-rejection";
import { clearPendingCreateTaskAssignee } from "./pending-create-task-assignee";
import { clearPendingAbsenceDelegation } from "./pending-absence-delegation";
import { clearPendingBudgetSelection } from "./pending-budget-selection";
import { clearPendingProjectSelection } from "./pending-project-selection";
import { clearPendingAbsenceSelection } from "./pending-absence-selection";
import { createChoiceId } from "./choice-id";

export type PendingUserSelectionType =
  | "select_user_for_task_assignee"
  | "select_user_for_transfer"
  | "select_user_for_reassign_from"
  | "select_user_for_reassign_to"
  | "select_user_for_mention"
  | "select_user_for_comment_mention"
  | "select_user_for_absence"
  | "select_user_for_absence_cancel"
  | "select_user_for_absence_delegation_item"
  | "select_user_for_link"
  | "select_user_for_task_list"
  | "select_user_for_completed_task_list"
  | "select_user_for_other";

export type UserCandidate = {
  id: string;
  fullName: string;
  role: string;
  telegramUsername?: string | null;
  telegramId?: string | null;
};

export type CreateTaskUserSelectionPayload = {
  intent: "create_task";
  projectHint?: string;
  title: string;
  description?: string;
  deadlineDate?: string;
  creatorId: string;
};

export type TransferUserSelectionPayload = {
  intent: "transfer_task";
  taskTitle: string;
  comment?: string;
  aiIntentPayload?: Record<string, unknown>;
};

export type ReassignUserSelectionPayload = {
  intent: "reassign_task";
  taskTitle: string;
  comment?: string;
  fromUserId?: string;
  fromUserName?: string;
  toUserHint: string;
  aiIntentPayload?: Record<string, unknown>;
};

export type MentionUserSelectionPayload = {
  intent: "mention_in_task";
  taskTitle: string;
  text?: string;
  aiIntentPayload?: Record<string, unknown>;
};

export type AbsenceUserSelectionPayload = {
  intent: "create_absence";
  type: "SICK_LEAVE" | "VACATION";
  startDate: string;
  endDate: string;
  documentNumber?: string;
  comment?: string;
};

export type CancelAbsenceUserSelectionPayload = {
  intent: "cancel_absence";
  type?: "SICK_LEAVE" | "VACATION";
  cancellationReason?: string;
};

export type AbsenceDelegationItemUserSelectionPayload = {
  intent: "absence_delegation_item";
  absenceId: string;
  absenceUserId: string;
  absenceUserName: string;
  absenceType: "SICK_LEAVE" | "VACATION";
  startDate: string;
  endDate: string;
  tasks: import("./pending-absence-delegation").AbsenceDelegationTaskItem[];
  index: number;
  assignments: import("./pending-absence-delegation").AbsenceDelegationAssignment[];
};

export type LinkUserSelectionPayload = {
  intent: "link_telegram";
};

export type TaskListUserSelectionPayload = {
  intent: "task_list";
  limit?: number;
  projectHint?: string;
};

export type CompletedTaskListUserSelectionPayload = {
  intent: "completed_task_list";
  limit?: number;
};

export type CommentMentionUserSelectionPayload = {
  intent: "comment_mention";
  taskHint: string;
  commentText: string;
};

export type UserSelectionPayload =
  | CreateTaskUserSelectionPayload
  | TransferUserSelectionPayload
  | ReassignUserSelectionPayload
  | MentionUserSelectionPayload
  | AbsenceUserSelectionPayload
  | CancelAbsenceUserSelectionPayload
  | AbsenceDelegationItemUserSelectionPayload
  | LinkUserSelectionPayload
  | TaskListUserSelectionPayload
  | CompletedTaskListUserSelectionPayload
  | CommentMentionUserSelectionPayload;

export type PendingUserSelection = {
  choiceId: string;
  type: PendingUserSelectionType;
  candidates: UserCandidate[];
  payload: UserSelectionPayload;
  createdAt: number;
};

const pendingUserSelectionByTelegramUserId = new Map<number, PendingUserSelection>();

export const PENDING_USER_SELECTION_TTL_MS = 30 * 60 * 1000;

export function apiUserToCandidate(user: ApiUser): UserCandidate {
  return {
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    telegramUsername: user.telegramUsername,
    telegramId: user.telegramId,
  };
}

export function getPendingUserSelection(
  telegramUserId: number,
): PendingUserSelection | undefined {
  return pendingUserSelectionByTelegramUserId.get(telegramUserId);
}

export function setPendingUserSelection(
  telegramUserId: number,
  pending: PendingUserSelection,
): void {
  pendingUserSelectionByTelegramUserId.set(telegramUserId, {
    ...pending,
    choiceId: pending.choiceId ?? createChoiceId(),
  });
}

export function clearPendingUserSelection(telegramUserId: number): void {
  pendingUserSelectionByTelegramUserId.delete(telegramUserId);
}

export function isPendingUserSelectionExpired(pending: PendingUserSelection): boolean {
  return Date.now() - pending.createdAt > PENDING_USER_SELECTION_TTL_MS;
}

/** Сбросить другие pending и сохранить выбор сотрудника. */
export function startPendingUserSelection(
  telegramUserId: number,
  type: PendingUserSelectionType,
  candidates: UserCandidate[],
  payload: UserSelectionPayload,
): void {
  clearPendingConfirmation(telegramUserId);
  clearPendingTaskSelection(telegramUserId);
  clearPendingTaskStatusDetails(telegramUserId);
  clearPendingTaskCommentDetails(telegramUserId);
  clearPendingTaskMentionDetails(telegramUserId);
  clearPendingTaskTransferComment(telegramUserId);
  clearPendingTaskTransferDecision(telegramUserId);
  clearPendingTaskTransferRejection(telegramUserId);
  clearPendingCreateTaskAssignee(telegramUserId);
  clearPendingAbsenceDelegation(telegramUserId);
  clearPendingAbsenceSelection(telegramUserId);
  clearPendingBudgetSelection(telegramUserId);
  clearPendingProjectSelection(telegramUserId);
  setPendingUserSelection(telegramUserId, {
    choiceId: createChoiceId(),
    type,
    candidates,
    payload,
    createdAt: Date.now(),
  });
}
