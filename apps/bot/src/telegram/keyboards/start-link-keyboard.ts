import { InlineKeyboard } from "grammy";

export type StartLinkAction = "yes" | "no";

export const START_LINK_CALLBACK_PREFIX = "start-link";
const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

export function buildStartLinkCallbackData(
  action: StartLinkAction,
  ownerTelegramUserId: number,
  confirmationId: string,
): string {
  return `${START_LINK_CALLBACK_PREFIX}:${action}:${ownerTelegramUserId}:${confirmationId}`;
}

function isCallbackDataSafeLength(callbackData: string): boolean {
  return Buffer.byteLength(callbackData, "utf8") <= TELEGRAM_CALLBACK_DATA_MAX_BYTES;
}

function safeStartLinkCallbackData(
  action: StartLinkAction,
  ownerTelegramUserId: number,
  confirmationId: string,
): string {
  const callbackData = buildStartLinkCallbackData(action, ownerTelegramUserId, confirmationId);
  if (isCallbackDataSafeLength(callbackData)) return callbackData;
  console.warn("[bot] start-link callback_data exceeds Telegram limit", {
    action,
    ownerTelegramUserId,
    confirmationId,
    length: Buffer.byteLength(callbackData, "utf8"),
  });
  throw new Error("start-link callback_data exceeds Telegram 64-byte limit");
}

export function buildStartLinkKeyboard(options: {
  ownerTelegramUserId: number;
  confirmationId: string;
}): InlineKeyboard {
  const { ownerTelegramUserId, confirmationId } = options;
  return new InlineKeyboard()
    .text("Да", safeStartLinkCallbackData("yes", ownerTelegramUserId, confirmationId))
    .text("Нет", safeStartLinkCallbackData("no", ownerTelegramUserId, confirmationId));
}

export function parseStartLinkCallbackData(
  data: string | undefined,
): { action: StartLinkAction; ownerTelegramUserId: number; confirmationId: string } | null {
  if (!data) return null;

  const parts = data.split(":");
  if (parts[0] !== START_LINK_CALLBACK_PREFIX) return null;

  const action = parts[1];
  if (action !== "yes" && action !== "no") return null;

  const ownerRaw = parts[2];
  const confirmationId = parts[3];
  if (ownerRaw === undefined || confirmationId === undefined) return null;

  const ownerTelegramUserId = Number(ownerRaw);
  if (!Number.isSafeInteger(ownerTelegramUserId) || ownerTelegramUserId <= 0) return null;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(confirmationId)) return null;

  return { action, ownerTelegramUserId, confirmationId };
}
