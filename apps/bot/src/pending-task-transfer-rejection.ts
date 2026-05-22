export type PendingTaskTransferRejection = {
  type: "awaiting_task_transfer_rejection_reason";
  transferId: string;
  taskId: string;
  taskTitle: string;
  requestedById: string;
  toUserId: string;
  toUserName: string;
  createdAt: number;
};

const pendingByTelegramUserId = new Map<number, PendingTaskTransferRejection>();

export const PENDING_TASK_TRANSFER_REJECTION_TTL_MS = 30 * 60 * 1000;

export function getPendingTaskTransferRejection(
  telegramUserId: number,
): PendingTaskTransferRejection | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function setPendingTaskTransferRejection(
  telegramUserId: number,
  pending: PendingTaskTransferRejection,
): void {
  pendingByTelegramUserId.set(telegramUserId, pending);
}

export function clearPendingTaskTransferRejection(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}

export function isPendingTaskTransferRejectionExpired(
  pending: PendingTaskTransferRejection,
): boolean {
  return Date.now() - pending.createdAt > PENDING_TASK_TRANSFER_REJECTION_TTL_MS;
}
