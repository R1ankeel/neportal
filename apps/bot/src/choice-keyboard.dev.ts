import {
  buildChoiceCallbackData,
  buildChoiceKeyboard,
  parseChoiceCallbackData,
} from "./telegram/keyboards/choice-keyboard";
import { createChoiceId } from "./choice-id";

function logCheck(name: string, ok: boolean, data?: Record<string, unknown>): void {
  console.log(`[choice-keyboard] ${name} ${ok ? "OK" : "FAIL"}`, data ?? {});
}

function callbackData(button: unknown): string | undefined {
  if (!button || typeof button !== "object") return undefined;
  const value = (button as { callback_data?: unknown }).callback_data;
  return typeof value === "string" ? value : undefined;
}

export function devLogChoiceKeyboardChecks(): void {
  const randomChoiceId = createChoiceId();
  const nextRandomChoiceId = createChoiceId();
  const keyboard = buildChoiceKeyboard({
    ownerTelegramUserId: 123,
    choiceId: randomChoiceId,
    options: ["Мария Соколова", "Марина Иванова"],
  });
  const rows = keyboard.inline_keyboard;

  logCheck("option buttons", rows.length === 3, { rows });
  logCheck(
    "choiceId random format",
    /^[A-Za-z0-9_-]{10,16}$/.test(randomChoiceId),
    { randomChoiceId },
  );
  logCheck("choiceId is not sequential numeric", !/^\d+$/.test(randomChoiceId));
  logCheck("choiceId rotates", randomChoiceId !== nextRandomChoiceId);
  logCheck(
    "first callback",
    callbackData(rows[0]?.[0]) === `choice:select:123:${randomChoiceId}:0`,
    {
      got: callbackData(rows[0]?.[0]),
    },
  );
  logCheck(
    "second callback",
    callbackData(rows[1]?.[0]) === `choice:select:123:${randomChoiceId}:1`,
    {
      got: callbackData(rows[1]?.[0]),
    },
  );
  logCheck("cancel callback", callbackData(rows[2]?.[0]) === `choice:cancel:123:${randomChoiceId}`, {
    got: callbackData(rows[2]?.[0]),
  });

  const parsed = parseChoiceCallbackData(`choice:select:123:${randomChoiceId}:1`);
  logCheck(
    "parse select",
    JSON.stringify(parsed) ===
      JSON.stringify({
        action: "select",
        ownerTelegramUserId: 123,
        choiceId: randomChoiceId,
        optionIndex: 1,
      }),
  );
  logCheck(
    "foreign user guard parseable",
    parseChoiceCallbackData(`choice:select:124:${randomChoiceId}:1`)?.ownerTelegramUserId === 124,
  );
  logCheck(
    "stale mismatch no-op guard",
    parseChoiceCallbackData(`choice:select:123:${nextRandomChoiceId}:1`)?.choiceId !== randomChoiceId,
  );
  logCheck(
    "payload <= 64 bytes",
    Buffer.byteLength(
      buildChoiceCallbackData({
        action: "select",
        ownerTelegramUserId: 1234567890,
        choiceId: "abcdefghijk",
        optionIndex: 9,
      }),
      "utf8",
    ) <= 64,
  );
}
