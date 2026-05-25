import {
  buildChoiceCallbackData,
  buildChoiceKeyboard,
  parseChoiceCallbackData,
} from "./telegram/keyboards/choice-keyboard";

function logCheck(name: string, ok: boolean, data?: Record<string, unknown>): void {
  console.log(`[choice-keyboard] ${name} ${ok ? "OK" : "FAIL"}`, data ?? {});
}

function callbackData(button: unknown): string | undefined {
  if (!button || typeof button !== "object") return undefined;
  const value = (button as { callback_data?: unknown }).callback_data;
  return typeof value === "string" ? value : undefined;
}

export function devLogChoiceKeyboardChecks(): void {
  const keyboard = buildChoiceKeyboard({
    ownerTelegramUserId: 123,
    choiceId: "7",
    options: ["Мария Соколова", "Марина Иванова"],
  });
  const rows = keyboard.inline_keyboard;

  logCheck("option buttons", rows.length === 3, { rows });
  logCheck("first callback", callbackData(rows[0]?.[0]) === "choice:select:123:7:0", {
    got: callbackData(rows[0]?.[0]),
  });
  logCheck("second callback", callbackData(rows[1]?.[0]) === "choice:select:123:7:1", {
    got: callbackData(rows[1]?.[0]),
  });
  logCheck("cancel callback", callbackData(rows[2]?.[0]) === "choice:cancel:123:7", {
    got: callbackData(rows[2]?.[0]),
  });

  const parsed = parseChoiceCallbackData("choice:select:123:7:1");
  logCheck(
    "parse select",
    JSON.stringify(parsed) ===
      JSON.stringify({
        action: "select",
        ownerTelegramUserId: 123,
        choiceId: "7",
        optionIndex: 1,
      }),
  );
  logCheck(
    "payload short",
    buildChoiceCallbackData({
      action: "select",
      ownerTelegramUserId: 123,
      choiceId: "7",
      optionIndex: 1,
    }).length <= 64,
  );
}
