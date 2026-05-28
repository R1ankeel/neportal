import { InlineKeyboard } from "grammy";

export const MENTION_ADD_CALLBACK_PREFIX = "mention_add";

export type MentionAddAction = "yes" | "no";

const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

function buildMentionAddCallbackData(
  action: MentionAddAction,
  ownerTelegramUserId: number,
  choiceId: string,
): string {
  return `${MENTION_ADD_CALLBACK_PREFIX}:${action}:${ownerTelegramUserId}:${choiceId}`;
}

function isCallbackDataSafeLength(callbackData: string): boolean {
  return Buffer.byteLength(callbackData, "utf8") <= TELEGRAM_CALLBACK_DATA_MAX_BYTES;
}

function safeMentionAddCallbackData(
  action: MentionAddAction,
  ownerTelegramUserId: number,
  choiceId: string,
): string {
  const callbackData = buildMentionAddCallbackData(action, ownerTelegramUserId, choiceId);
  if (isCallbackDataSafeLength(callbackData)) return callbackData;
  throw new Error("mention_add callback_data exceeds Telegram 64-byte limit");
}

export function buildMentionAddToProjectKeyboard(
  ownerTelegramUserId: number,
  choiceId: string,
): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      "Добавить в проект",
      safeMentionAddCallbackData("yes", ownerTelegramUserId, choiceId),
    )
    .row()
    .text(
      "Отмена",
      safeMentionAddCallbackData("no", ownerTelegramUserId, choiceId),
    );
}

export function parseMentionAddCallbackData(data: string | undefined):
  | {
      action: MentionAddAction;
      ownerTelegramUserId: number;
      choiceId: string;
    }
  | null {
  if (!data) return null;
  const parts = data.split(":");
  if (parts[0] !== MENTION_ADD_CALLBACK_PREFIX) return null;

  const action = parts[1];
  if (action !== "yes" && action !== "no") return null;

  const ownerTelegramUserId = Number(parts[2]);
  if (!Number.isSafeInteger(ownerTelegramUserId) || ownerTelegramUserId <= 0) return null;

  const choiceId = parts[3];
  if (!choiceId || !/^[A-Za-z0-9_-]{1,32}$/.test(choiceId)) return null;

  return { action, ownerTelegramUserId, choiceId };
}
