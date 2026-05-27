import { Keyboard } from "grammy";

export const PERSISTENT_MENU_BUTTON_TEXT = "☰ Главное меню";

/** Reply keyboard с постоянной кнопкой «Главное меню». Прикрепляется к сообщению один раз. */
export function buildPersistentMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text(PERSISTENT_MENU_BUTTON_TEXT)
    .resized()
    .persistent();
}

/** Нормализованные тексты, которые открывают главное меню из reply keyboard или вручную. */
const MAIN_MENU_TRIGGER_TEXTS = new Set([
  "☰ главное меню",
  "главное меню",
  "меню",
  "/menu",
]);

export function isMainMenuTrigger(text: string): boolean {
  return MAIN_MENU_TRIGGER_TEXTS.has(text.trim().toLowerCase().replace(/ё/g, "е"));
}
