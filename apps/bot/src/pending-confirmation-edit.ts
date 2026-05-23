import type { PendingAiIntent } from "./pending-intent";

export type PendingConfirmationEdit = {
  originalConfirmation: PendingAiIntent;
  createdAt: number;
};

const pendingEditByTelegramUserId = new Map<number, PendingConfirmationEdit>();

export const PENDING_CONFIRMATION_EDIT_TTL_MS = 30 * 60 * 1000;

export function getPendingConfirmationEdit(
  telegramUserId: number,
): PendingConfirmationEdit | undefined {
  const pending = pendingEditByTelegramUserId.get(telegramUserId);
  if (!pending) return undefined;
  if (isPendingConfirmationEditExpired(pending)) {
    pendingEditByTelegramUserId.delete(telegramUserId);
    return undefined;
  }
  return pending;
}

export function startPendingConfirmationEdit(
  telegramUserId: number,
  originalConfirmation: PendingAiIntent,
): void {
  pendingEditByTelegramUserId.set(telegramUserId, {
    originalConfirmation,
    createdAt: Date.now(),
  });
}

export function clearPendingConfirmationEdit(telegramUserId: number): void {
  pendingEditByTelegramUserId.delete(telegramUserId);
}

export function isPendingConfirmationEditExpired(
  pending: PendingConfirmationEdit,
): boolean {
  return Date.now() - pending.createdAt > PENDING_CONFIRMATION_EDIT_TTL_MS;
}
