export const CREATE_TASK_PROMPT = `Intent: create_task.

Payload: { projectHint?, assigneeHint?, assigneeUserId?, title, description?, deadlineDate? }

Правила: assigneeHint отдельно от title («Маше задачу …» → assigneeHint=Маше, title=действие); «мне» → "__self__"; даты → deadlineDate.

Пример: «поставь Маше задачу подготовить презентацию к пятнице»
→ {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Маше","title":"Подготовить презентацию","deadlineDate":"2026-05-29"}}

Пример: «Поставь Тохе задачу проверить склад»
→ {"intent":"create_task","confidence":0.9,"requiresConfirmation":true,"payload":{"assigneeHint":"Тохе","title":"Проверить склад"}}`;
