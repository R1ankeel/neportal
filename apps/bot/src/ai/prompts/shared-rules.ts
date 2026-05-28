/** Минимальный JSON-контракт для всех extractor-групп. */
export const CORE_JSON_RULES = `Верни ТОЛЬКО один JSON: intent, confidence, requiresConfirmation, payload.
Без markdown и текста вне JSON. Неизвестное → intent "unknown".
Даты: YYYY-MM-DD от «Текущая дата». Не возвращай null-поля.`;

/** Правила сопоставления сотрудников (только где есть список в контексте). */
export const USER_HINT_RULES = `Сотрудники в контексте: userId только при уверенности; иначе hint. «мне/себе» → "__self__".`;

/** Извлечение названия проекта из фразы пользователя (только для проектных intent). */
export const PROJECT_HINT_RULES = `Если пользователь явно называет проект («в проекте X», «по проекту X») — верни projectHint: подстроку названия из списка «Проекты» (без кавычек). Не выдумывай projectHint без явной фразы. Заметки (create_note) глобальные — projectHint не используй.`;
