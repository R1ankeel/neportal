export type PendingTaskTransferComment = {
  type: "awaiting_task_transfer_comment";
  taskId: string;
  taskTitle: string;
  toUserId: string;
  toUserName: string;
  createdAt: number;
};

const pendingByTelegramUserId = new Map<number, PendingTaskTransferComment>();

export const PENDING_TASK_TRANSFER_COMMENT_TTL_MS = 30 * 60 * 1000;

export function getPendingTaskTransferComment(
  telegramUserId: number,
): PendingTaskTransferComment | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function setPendingTaskTransferComment(
  telegramUserId: number,
  pending: PendingTaskTransferComment,
): void {
  pendingByTelegramUserId.set(telegramUserId, pending);
}

export function clearPendingTaskTransferComment(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}

export function isPendingTaskTransferCommentExpired(
  pending: PendingTaskTransferComment,
): boolean {
  return Date.now() - pending.createdAt > PENDING_TASK_TRANSFER_COMMENT_TTL_MS;
}
