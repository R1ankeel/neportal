export type PendingTaskMentionDetails = {
  type: "awaiting_task_mention_text";
  taskId: string;
  taskTitle: string;
  mentionedUserId: string;
  mentionedUserName: string;
  creatorId: string;
  assigneeId: string | null;
  createdAt: number;
};

const pendingMentionByTelegramUserId = new Map<number, PendingTaskMentionDetails>();

export const PENDING_TASK_MENTION_DETAILS_TTL_MS = 30 * 60 * 1000;

export function getPendingTaskMentionDetails(
  telegramUserId: number,
): PendingTaskMentionDetails | undefined {
  return pendingMentionByTelegramUserId.get(telegramUserId);
}

export function setPendingTaskMentionDetails(
  telegramUserId: number,
  pending: PendingTaskMentionDetails,
): void {
  pendingMentionByTelegramUserId.set(telegramUserId, pending);
}

export function clearPendingTaskMentionDetails(telegramUserId: number): void {
  pendingMentionByTelegramUserId.delete(telegramUserId);
}

export function isPendingTaskMentionDetailsExpired(
  pending: PendingTaskMentionDetails,
): boolean {
  return Date.now() - pending.createdAt > PENDING_TASK_MENTION_DETAILS_TTL_MS;
}
