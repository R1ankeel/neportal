import { InlineKeyboard } from "grammy";

export type ConfirmationAction = "confirm" | "edit" | "cancel";

export const CONFIRMATION_CALLBACK_PREFIX = "confirmation";
const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

export function buildConfirmationCallbackData(
  action: ConfirmationAction,
  ownerTelegramUserId?: number,
  confirmationId?: string,
): string {
  const base =
    ownerTelegramUserId == null
      ? `${CONFIRMATION_CALLBACK_PREFIX}:${action}`
      : `${CONFIRMATION_CALLBACK_PREFIX}:${action}:${ownerTelegramUserId}`;
  return confirmationId ? `${base}:${confirmationId}` : base;
}

function isCallbackDataSafeLength(callbackData: string): boolean {
  return Buffer.byteLength(callbackData, "utf8") <= TELEGRAM_CALLBACK_DATA_MAX_BYTES;
}

function safeConfirmationCallbackData(
  action: ConfirmationAction,
  ownerTelegramUserId?: number,
  confirmationId?: string,
): string {
  const callbackData = buildConfirmationCallbackData(action, ownerTelegramUserId, confirmationId);
  if (isCallbackDataSafeLength(callbackData)) return callbackData;
  console.warn("[bot] confirmation callback_data exceeds Telegram limit", {
    action,
    ownerTelegramUserId,
    confirmationId,
    length: Buffer.byteLength(callbackData, "utf8"),
  });
  throw new Error("confirmation callback_data exceeds Telegram 64-byte limit");
}

export function buildConfirmationKeyboard(options?: {
  ownerTelegramUserId?: number;
  confirmationId?: string;
}): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      "Подтвердить",
      safeConfirmationCallbackData(
        "confirm",
        options?.ownerTelegramUserId,
        options?.confirmationId,
      ),
    )
    .text(
      "Изменить",
      safeConfirmationCallbackData(
        "edit",
        options?.ownerTelegramUserId,
        options?.confirmationId,
      ),
    )
    .text(
      "Отменить",
      safeConfirmationCallbackData(
        "cancel",
        options?.ownerTelegramUserId,
        options?.confirmationId,
      ),
    );
}

export function parseConfirmationCallbackData(
  data: string | undefined,
): {
  action: ConfirmationAction;
  ownerTelegramUserId?: number;
  confirmationId?: string;
} | null {
  if (!data) return null;

  const parts = data.split(":");
  if (parts[0] !== CONFIRMATION_CALLBACK_PREFIX) return null;

  const action = parts[1];
  if (action !== "confirm" && action !== "edit" && action !== "cancel") {
    return null;
  }

  const ownerRaw = parts[2];
  if (ownerRaw === undefined) return { action };

  const ownerTelegramUserId = Number(ownerRaw);
  if (!Number.isSafeInteger(ownerTelegramUserId) || ownerTelegramUserId <= 0) {
    return null;
  }

  const confirmationId = parts[3];
  if (confirmationId !== undefined && !/^[A-Za-z0-9_-]{1,32}$/.test(confirmationId)) {
    return null;
  }

  return { action, ownerTelegramUserId, confirmationId };
}
