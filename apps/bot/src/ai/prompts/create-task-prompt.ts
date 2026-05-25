export const CREATE_TASK_PROMPT = `Intent: create_task.

Payload: { projectHint?, assigneeHint?, assigneeUserId?, title, description?, deadlineDate? }

Правила:
- assigneeHint отдельно от title; «мне» → "__self__"; фразы срока → только deadlineDate (ISO YYYY-MM-DD).
- Сложные сроки («первая пятница июля», «через 2 месяца») — точная календарная дата, не ближайший weekday от сегодня.
- title — действие/результат задачи, не дата и не «первая пятница следующего месяца».
- description — только доп. детали исполнения; если их нет — null/пусто; не дублируй title и не повторяй фразу срока.
- Не помещай deadline phrase в title или description.
- Несколько действий через запятые: первое → title, остальные → description.
- Не склеивай весь длинный запрос в title. Убери «создай задачу», «пусть» из title.

Пример: «поставь Маше задачу подготовить презентацию к пятнице»
→ {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Маше","title":"Подготовить презентацию","deadlineDate":"2026-05-29"}}

Пример: «создай задачу роме, пусть поедет к узбекским поставщикам, разберется, почему беспорядок, проверит качество на месте»
→ {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"роме","title":"Поехать к узбекским поставщикам","description":"Разобраться, почему у поставщиков беспорядок. Проверить качество продукции на месте."}}`;
