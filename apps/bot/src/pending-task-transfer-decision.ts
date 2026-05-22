export type PendingTaskTransferDecision = {
  type: "pending_task_transfer_decision";
  transferId: string;
  taskId: string;
  taskTitle: string;
  requestedById: string;
  requestedByName: string;
  toUserId: string;
  comment?: string;
  projectName?: string;
  createdAt: number;
};

const pendingByTelegramUserId = new Map<number, PendingTaskTransferDecision>();

export const PENDING_TASK_TRANSFER_DECISION_TTL_MS = 30 * 60 * 1000;

export function getPendingTaskTransferDecision(
  telegramUserId: number,
): PendingTaskTransferDecision | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function setPendingTaskTransferDecision(
  telegramUserId: number,
  pending: PendingTaskTransferDecision,
): void {
  pendingByTelegramUserId.set(telegramUserId, pending);
}

export function clearPendingTaskTransferDecision(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}

export function isPendingTaskTransferDecisionExpired(
  pending: PendingTaskTransferDecision,
): boolean {
  return Date.now() - pending.createdAt > PENDING_TASK_TRANSFER_DECISION_TTL_MS;
}
