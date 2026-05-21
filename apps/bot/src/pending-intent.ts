import type { AiIntent } from "./ai-contracts";
import type { ResolvedIntent } from "./intent-resolver";

export type PendingAiIntent = {
  type: "ai_intent";
  intent: AiIntent;
  resolved: ResolvedIntent;
};

export type PendingLinkByUsername = {
  type: "confirm_link_by_username";
  userId: string;
  fullName: string;
  username: string;
};

export type PendingConfirmation = PendingAiIntent | PendingLinkByUsername;

const pendingByTelegramUserId = new Map<number, PendingConfirmation>();

export function getPendingConfirmation(
  telegramUserId: number,
): PendingConfirmation | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function setPendingConfirmation(
  telegramUserId: number,
  pending: PendingConfirmation,
): void {
  pendingByTelegramUserId.set(telegramUserId, pending);
}

export function clearPendingConfirmation(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}
