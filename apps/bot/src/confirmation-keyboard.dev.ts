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
import { setPendingConfirmation, getPendingConfirmation } from "./pending-intent";

function logCheck(name: string, ok: boolean, data?: Record<string, unknown>): void {
  console.log(`[confirmation-keyboard] ${name} ${ok ? "OK" : "FAIL"}`, data ?? {});
}

function callbackData(button: unknown): string | undefined {
  if (!button || typeof button !== "object") return undefined;
  const value = (button as { callback_data?: unknown }).callback_data;
  return typeof value === "string" ? value : undefined;
}

export function devLogConfirmationKeyboardChecks(): void {
  const keyboard = buildConfirmationKeyboard({ ownerTelegramUserId: 123, confirmationId: "abc123" });
  const row = keyboard.inline_keyboard[0] ?? [];
  logCheck("three buttons", row.length === 3, { row });
  logCheck(
    "callback confirm",
    callbackData(row[0]) === "confirmation:confirm:123:abc123",
    { got: callbackData(row[0]) },
  );
  logCheck(
    "callback edit",
    callbackData(row[1]) === "confirmation:edit:123:abc123",
    { got: callbackData(row[1]) },
  );
  logCheck(
    "callback cancel",
    callbackData(row[2]) === "confirmation:cancel:123:abc123",
    { got: callbackData(row[2]) },
  );

  logCheck(
    "parse callback",
    JSON.stringify(parseConfirmationCallbackData("confirmation:confirm:123:abc123")) ===
      JSON.stringify({ action: "confirm", ownerTelegramUserId: 123, confirmationId: "abc123" }),
  );
  logCheck(
    "callback without owner",
    buildConfirmationCallbackData("cancel") === "confirmation:cancel",
  );
  logCheck(
    "callback payload <= 64 bytes",
    Buffer.byteLength(buildConfirmationCallbackData("confirm", 1234567890, "abcdefghijk"), "utf8") <=
      64,
  );

  const telegramUserId = 998877;
  const firstId = setPendingConfirmation(telegramUserId, {
    type: "confirm_link_by_username",
    userId: "u-1",
    fullName: "Test User",
    username: "testuser",
  });
  const secondId = setPendingConfirmation(telegramUserId, {
    type: "confirm_link_by_username",
    userId: "u-2",
    fullName: "Test User 2",
    username: "testuser2",
  });
  logCheck("confirmationId random format", /^[A-Za-z0-9_-]{10,16}$/.test(firstId));
  logCheck("confirmationId is not sequential numeric", !/^\d+$/.test(firstId));
  logCheck("confirmationId rotates across updates", firstId !== secondId);
  logCheck(
    "stale mismatch no-op guard",
    getPendingConfirmation(telegramUserId)?.confirmationId === secondId && firstId !== secondId,
  );
  logCheck(
    "foreign user guard parseable",
    parseConfirmationCallbackData(`confirmation:confirm:${telegramUserId + 1}:${secondId}`)?.ownerTelegramUserId ===
      telegramUserId + 1,
  );

  logCheck("text yes fallback", isConfirmationYes("да") && isConfirmationYes("ок"));
  logCheck("text confirm fallback", isConfirmationYes("подтвердить"));
  logCheck("text edit fallback", isConfirmationEdit("изменить"));
  logCheck(
    "text cancel fallback",
    isConfirmationNo("нет") && isConfirmationCancel("отмена") && isConfirmationCancel("cancel"),
  );
}
