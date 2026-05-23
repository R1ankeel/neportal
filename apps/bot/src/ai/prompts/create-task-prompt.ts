export const CREATE_TASK_PROMPT = `Разрешённые intent: create_task.

create_task.payload:
{ "projectHint"?: string, "assigneeHint"?: string, "title": string, "description"?: string, "deadlineDate"?: "YYYY-MM-DD" }

Правила:
- assigneeHint — только исполнитель («поставь Васе», «поручи Ивану», «мне» → "__self__").
- Имена внутри действия («позвонить Ивану») — title/description, НЕ assigneeHint.
- title — короткое главное действие без даты; description — остальные детали (без дедлайна и исполнителя).
- «сегодня», «завтра», «до DD.MM», «через месяц», «в следующем месяце» → deadlineDate (не в title/description).

Пример:
Input: «Поставь мне задачу проверить склад завтра»
Output: {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"__self__","title":"Проверить склад","deadlineDate":"2026-05-23"}}

Пример:
Input: «Поставь Васе задачу уволить Петю через месяц»
Output: {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Вася","title":"Уволить Петю","deadlineDate":"2026-06-22"}}

Пример:
Input: «Поставь Маше задачу проверить кабинет, выгрузить статистику и подготовить отчет»
Output: {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Маша","title":"Проверить кабинет","description":"1. Выгрузить статистику.\\n2. Подготовить отчет."}}

Пример:
Input: «Поручи Ивану позвонить Васе завтра»
Output: {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Иван","title":"Позвонить Васе","deadlineDate":"2026-05-23"}}

Пример:
Input: «Создай задачу для Васи поехать к поставщику и закупить краску»
Output: {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Вася","title":"Поехать к поставщику","description":"Закупить краску."}}`;
