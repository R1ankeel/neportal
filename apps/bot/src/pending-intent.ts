import type { AiIntent } from "./ai-contracts";
import type { ResolvedIntent } from "./intent-resolver";

export type PendingConfirmation = {
  intent: AiIntent;
  resolved: ResolvedIntent;
};

const pendingByTelegramUserId = new Map<number, PendingConfirmation>();

export function getPendingConfirmation(telegramUserId: number): PendingConfirmation | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function setPendingConfirmation(telegramUserId: number, pending: PendingConfirmation): void {
  pendingByTelegramUserId.set(telegramUserId, pending);
}

export function clearPendingConfirmation(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}
