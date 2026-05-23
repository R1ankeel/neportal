export const CREATE_TASK_PROMPT = `Разрешённые intent: create_task.

create_task.payload:
{ "projectHint"?: string, "assigneeHint"?: string, "title": string, "description"?: string, "deadlineDate"?: "YYYY-MM-DD" }

Правила assignee и title:
- assigneeHint — только исполнитель; «мне»/«себе» → "__self__".
- Конструкции с исполнителем (НЕ в title):
  «задачу для Васи …», «задача для Васи …», «заведи задачу на Васю …»,
  «поставь задачу на Васю …», «нужно завести задачу на Васю …», «создай задачу для Васи …»
  → assigneeHint = имя («Вася»), title = действие ПОСЛЕ имени.
- «для Васи» / «на Васю» НЕ включать в title.
- Имена внутри действия («позвонить Ивану») — title/description, НЕ assigneeHint.
- title — короткое главное действие без даты; description — остальные шаги.
- «сегодня», «завтра», «до DD.MM» → deadlineDate.

Пример:
Input: «создай задачу для Васи купить бумагу для офиса»
Output: {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Вася","title":"Купить бумагу для офиса"}}

Пример:
Input: «нужно завести задачу на Васю поехать в офис к поставщикам, проверить их склад и продумать, можно ли с ними работать»
Output: {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Вася","title":"Поехать в офис к поставщикам","description":"1. Проверить их склад.\\n2. Продумать, можно ли с ними работать."}}

Пример:
Input: «заведи задачу на Васю проверить склад завтра»
Output: {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Вася","title":"Проверить склад","deadlineDate":"2026-05-24"}}

Пример:
Input: «Поручи Ивану позвонить Васе завтра»
Output: {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Иван","title":"Позвонить Васе","deadlineDate":"2026-05-23"}}

Пример:
Input: «Поставь мне задачу проверить склад завтра»
Output: {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"__self__","title":"Проверить склад","deadlineDate":"2026-05-23"}}`;
