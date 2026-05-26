import { InlineKeyboard } from "grammy";

export const MAIN_MENU_CALLBACK_PREFIX = "main-menu";

export type MainMenuAction =
  | "my-tasks"
  | "create-task"
  | "create-note"
  | "create-expense"
  | "unconfirmed-expenses"
  | "sick"
  | "vacation"
  | "info";

const MAIN_MENU_ACTIONS: ReadonlySet<string> = new Set([
  "my-tasks",
  "create-task",
  "create-note",
  "create-expense",
  "unconfirmed-expenses",
  "sick",
  "vacation",
  "info",
]);

export function buildMainMenuCallbackData(
  action: MainMenuAction,
  ownerTelegramUserId: number,
): string {
  return `${MAIN_MENU_CALLBACK_PREFIX}:${action}:${ownerTelegramUserId}`;
}

export function buildMainMenuKeyboard(ownerTelegramUserId: number): InlineKeyboard {
  const cb = (action: MainMenuAction) =>
    buildMainMenuCallbackData(action, ownerTelegramUserId);

  return new InlineKeyboard()
    .text("Мои задачи", cb("my-tasks"))
    .row()
    .text("Создать задачу", cb("create-task"))
    .text("Записать заметку", cb("create-note"))
    .row()
    .text("Отчитаться по расходам", cb("create-expense"))
    .row()
    .text("Мои неподтвержденные расходы", cb("unconfirmed-expenses"))
    .row()
    .text("Больничный", cb("sick"))
    .text("Отпуск", cb("vacation"))
    .row()
    .text("Информация", cb("info"));
}

export function parseMainMenuCallbackData(
  data: string | undefined,
): { action: MainMenuAction; ownerTelegramUserId: number } | null {
  if (!data) return null;

  const parts = data.split(":");
  if (parts[0] !== MAIN_MENU_CALLBACK_PREFIX) return null;

  const action = parts[1];
  if (!action || !MAIN_MENU_ACTIONS.has(action)) return null;

  const ownerRaw = parts[2];
  if (ownerRaw === undefined) return null;

  const ownerTelegramUserId = Number(ownerRaw);
  if (!Number.isSafeInteger(ownerTelegramUserId) || ownerTelegramUserId <= 0) return null;

  return { action: action as MainMenuAction, ownerTelegramUserId };
}
