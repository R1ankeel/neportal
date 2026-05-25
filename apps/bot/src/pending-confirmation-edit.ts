import type { AiIntent } from "./ai-contracts";
import type { EditableField } from "./confirmation/editable-fields";
import type { PendingAiIntent } from "./pending-intent";
import { createChoiceId } from "./choice-id";

export type ConfirmationEditStep = "select_field" | "await_value";

export type PendingConfirmationEdit = {
  telegramUserId: number;
  confirmationId?: string;
  choiceId: string;
  intent: AiIntent["intent"];
  step: ConfirmationEditStep;
  field?: string;
  fields: EditableField[];
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
  fields: EditableField[],
): void {
  pendingEditByTelegramUserId.set(telegramUserId, {
    telegramUserId,
    intent: originalConfirmation.intent.intent,
    choiceId: createChoiceId(),
    step: "select_field",
    fields,
    originalConfirmation,
    createdAt: Date.now(),
  });
}

export function setConfirmationEditStep(
  telegramUserId: number,
  step: ConfirmationEditStep,
  field?: string,
): void {
  const pending = pendingEditByTelegramUserId.get(telegramUserId);
  if (!pending) return;
  pending.step = step;
  if (step === "select_field") {
    pending.choiceId = createChoiceId();
  }
  if (field !== undefined) {
    pending.field = field;
  } else {
    delete pending.field;
  }
}

export function clearPendingConfirmationEdit(telegramUserId: number): void {
  pendingEditByTelegramUserId.delete(telegramUserId);
}

export function isPendingConfirmationEditExpired(
  pending: PendingConfirmationEdit,
): boolean {
  return Date.now() - pending.createdAt > PENDING_CONFIRMATION_EDIT_TTL_MS;
}
