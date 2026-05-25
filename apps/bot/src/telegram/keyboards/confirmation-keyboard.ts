import { InlineKeyboard } from "grammy";

export type ConfirmationAction = "confirm" | "edit" | "cancel";

export const CONFIRMATION_CALLBACK_PREFIX = "confirmation";

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

export function buildConfirmationKeyboard(options?: {
  ownerTelegramUserId?: number;
  confirmationId?: string;
}): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      "Подтвердить",
      buildConfirmationCallbackData(
        "confirm",
        options?.ownerTelegramUserId,
        options?.confirmationId,
      ),
    )
    .text(
      "Изменить",
      buildConfirmationCallbackData(
        "edit",
        options?.ownerTelegramUserId,
        options?.confirmationId,
      ),
    )
    .text(
      "Отменить",
      buildConfirmationCallbackData(
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
