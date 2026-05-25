import { InlineKeyboard } from "grammy";

export type ChoiceAction = "select" | "cancel";

export const CHOICE_CALLBACK_PREFIX = "choice";
const MAX_BUTTON_LABEL_LENGTH = 48;

function trimButtonLabel(label: string): string {
  const clean = label.trim().replace(/\s+/g, " ");
  if (clean.length <= MAX_BUTTON_LABEL_LENGTH) return clean;
  return `${clean.slice(0, MAX_BUTTON_LABEL_LENGTH - 1).trim()}…`;
}

export function buildChoiceCallbackData(params: {
  action: ChoiceAction;
  ownerTelegramUserId: number;
  choiceId: string;
  optionIndex?: number;
}): string {
  const base = `${CHOICE_CALLBACK_PREFIX}:${params.action}:${params.ownerTelegramUserId}:${params.choiceId}`;
  return params.action === "select" ? `${base}:${params.optionIndex}` : base;
}

export function buildChoiceKeyboard(params: {
  ownerTelegramUserId: number;
  choiceId: string;
  options: string[];
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  params.options.forEach((label, index) => {
    keyboard
      .text(
        `${index + 1}. ${trimButtonLabel(label)}`,
        buildChoiceCallbackData({
          action: "select",
          ownerTelegramUserId: params.ownerTelegramUserId,
          choiceId: params.choiceId,
          optionIndex: index,
        }),
      )
      .row();
  });

  keyboard.text(
    "Отменить",
    buildChoiceCallbackData({
      action: "cancel",
      ownerTelegramUserId: params.ownerTelegramUserId,
      choiceId: params.choiceId,
    }),
  );

  return keyboard;
}

export function parseChoiceCallbackData(data: string | undefined):
  | {
      action: ChoiceAction;
      ownerTelegramUserId: number;
      choiceId: string;
      optionIndex?: number;
    }
  | null {
  if (!data) return null;
  const parts = data.split(":");
  if (parts[0] !== CHOICE_CALLBACK_PREFIX) return null;

  const action = parts[1];
  if (action !== "select" && action !== "cancel") return null;

  const ownerTelegramUserId = Number(parts[2]);
  if (!Number.isSafeInteger(ownerTelegramUserId) || ownerTelegramUserId <= 0) return null;

  const choiceId = parts[3];
  if (!choiceId || !/^[A-Za-z0-9_-]{1,32}$/.test(choiceId)) return null;

  if (action === "cancel") {
    return { action, ownerTelegramUserId, choiceId };
  }

  const optionIndex = Number(parts[4]);
  if (!Number.isSafeInteger(optionIndex) || optionIndex < 0) return null;

  return { action, ownerTelegramUserId, choiceId, optionIndex };
}
