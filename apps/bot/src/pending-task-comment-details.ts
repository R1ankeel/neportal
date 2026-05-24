export type PendingTaskCommentText = {
  type: "awaiting_task_comment_text";
  taskId: string;
  taskTitle: string;
  creatorId: string;
  assigneeId: string | null;
  createdAt: number;
};

export type PendingTaskCommentMissingTask = {
  type: "awaiting_task_for_comment";
  commentText: string;
  createdAt: number;
};

export type PendingTaskCommentDetails =
  | PendingTaskCommentText
  | PendingTaskCommentMissingTask;

const pendingCommentByTelegramUserId = new Map<number, PendingTaskCommentDetails>();

export const PENDING_TASK_COMMENT_DETAILS_TTL_MS = 30 * 60 * 1000;

export function getPendingTaskCommentDetails(
  telegramUserId: number,
): PendingTaskCommentDetails | undefined {
  return pendingCommentByTelegramUserId.get(telegramUserId);
}

export function setPendingTaskCommentDetails(
  telegramUserId: number,
  pending: PendingTaskCommentText,
): void {
  pendingCommentByTelegramUserId.set(telegramUserId, pending);
}

export function setPendingTaskCommentMissingTask(
  telegramUserId: number,
  commentText: string,
): void {
  pendingCommentByTelegramUserId.set(telegramUserId, {
    type: "awaiting_task_for_comment",
    commentText: commentText.trim(),
    createdAt: Date.now(),
  });
}

export function clearPendingTaskCommentDetails(telegramUserId: number): void {
  pendingCommentByTelegramUserId.delete(telegramUserId);
}

export function isPendingTaskCommentDetailsExpired(
  pending: PendingTaskCommentDetails,
): boolean {
  return Date.now() - pending.createdAt > PENDING_TASK_COMMENT_DETAILS_TTL_MS;
}
