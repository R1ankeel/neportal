import {
  buildConfirmationCallbackData,
  buildConfirmationKeyboard,
  parseConfirmationCallbackData,
} from "./telegram/keyboards/confirmation-keyboard";
import {
  isConfirmationCancel,
  isConfirmationEdit,
  isConfirmationNo,
  isConfirmationYes,
} from "./confirmation";

function logCheck(name: string, ok: boolean, data?: Record<string, unknown>): void {
  console.log(`[confirmation-keyboard] ${name} ${ok ? "OK" : "FAIL"}`, data ?? {});
}

function callbackData(button: unknown): string | undefined {
  if (!button || typeof button !== "object") return undefined;
  const value = (button as { callback_data?: unknown }).callback_data;
  return typeof value === "string" ? value : undefined;
}

export function devLogConfirmationKeyboardChecks(): void {
  const keyboard = buildConfirmationKeyboard({ ownerTelegramUserId: 123, confirmationId: "42" });
  const row = keyboard.inline_keyboard[0] ?? [];
  logCheck("three buttons", row.length === 3, { row });
  logCheck(
    "callback confirm",
    callbackData(row[0]) === "confirmation:confirm:123:42",
    { got: callbackData(row[0]) },
  );
  logCheck(
    "callback edit",
    callbackData(row[1]) === "confirmation:edit:123:42",
    { got: callbackData(row[1]) },
  );
  logCheck(
    "callback cancel",
    callbackData(row[2]) === "confirmation:cancel:123:42",
    { got: callbackData(row[2]) },
  );

  logCheck(
    "parse callback",
    JSON.stringify(parseConfirmationCallbackData("confirmation:confirm:123:42")) ===
      JSON.stringify({ action: "confirm", ownerTelegramUserId: 123, confirmationId: "42" }),
  );
  logCheck(
    "callback without owner",
    buildConfirmationCallbackData("cancel") === "confirmation:cancel",
  );

  logCheck("text yes fallback", isConfirmationYes("да") && isConfirmationYes("ок"));
  logCheck("text confirm fallback", isConfirmationYes("подтвердить"));
  logCheck("text edit fallback", isConfirmationEdit("изменить"));
  logCheck(
    "text cancel fallback",
    isConfirmationNo("нет") && isConfirmationCancel("отмена") && isConfirmationCancel("cancel"),
  );
}
