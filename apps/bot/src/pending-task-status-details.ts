export type PendingTaskStatusDetailsType =
  | "awaiting_completion_result"
  | "awaiting_cancellation_reason";

export type PendingTaskStatusDetails = {
  type: PendingTaskStatusDetailsType;
  taskId: string;
  taskTitle: string;
  createdAt: number;
};

const pendingDetailsByTelegramUserId = new Map<number, PendingTaskStatusDetails>();

export const PENDING_TASK_STATUS_DETAILS_TTL_MS = 30 * 60 * 1000;

const DETAILS_CANCEL_RE = /^(?:отмена|отмени|нет|стоп)$/iu;

export function isPendingDetailsCancel(text: string): boolean {
  return DETAILS_CANCEL_RE.test(text.trim());
}

export function getPendingTaskStatusDetails(
  telegramUserId: number,
): PendingTaskStatusDetails | undefined {
  return pendingDetailsByTelegramUserId.get(telegramUserId);
}

export function setPendingTaskStatusDetails(
  telegramUserId: number,
  pending: PendingTaskStatusDetails,
): void {
  pendingDetailsByTelegramUserId.set(telegramUserId, pending);
}

export function clearPendingTaskStatusDetails(telegramUserId: number): void {
  pendingDetailsByTelegramUserId.delete(telegramUserId);
}

export function isPendingTaskStatusDetailsExpired(pending: PendingTaskStatusDetails): boolean {
  return Date.now() - pending.createdAt > PENDING_TASK_STATUS_DETAILS_TTL_MS;
}
