export const CREATE_TASK_PROMPT = `Intent: create_task.

Payload: { projectHint?, assigneeHint?, assigneeUserId?, title, description?, deadlineDate? }

Правила:
- assigneeHint отдельно от title; «мне» → "__self__"; даты → deadlineDate.
- title — короткое главное действие (3–8 слов), без лишних деталей.
- description — причины, доп. шаги, контекст; не дублируй title.
- Несколько действий через запятые: первое → title, остальные → description.
- Не склеивай весь длинный запрос в title. Убери «создай задачу», «пусть» из title.

Пример: «поставь Маше задачу подготовить презентацию к пятнице»
→ {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Маше","title":"Подготовить презентацию","deadlineDate":"2026-05-29"}}

Пример: «создай задачу роме, пусть поедет к узбекским поставщикам, разберется, почему беспорядок, проверит качество на месте»
→ {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"роме","title":"Поехать к узбекским поставщикам","description":"Разобраться, почему у поставщиков беспорядок. Проверить качество продукции на месте."}}`;
