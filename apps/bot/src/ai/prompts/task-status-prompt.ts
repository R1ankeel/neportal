export const TASK_STATUS_PROMPT = `Разрешённые intent: start_task, complete_task, cancel_task, set_task_deadline.

start_task.payload: { "taskTitle": string }
complete_task.payload: { "taskTitle": string, "completionResult"?: string }
cancel_task.payload: { "taskTitle": string, "cancellationReason"?: string }
set_task_deadline.payload: { "taskTitle": string, "deadlineDate": "YYYY-MM-DD" }

Правила:
- taskTitle — название задачи без префиксов «задачу», «в работу».
- «взял в работу», «беру в работу», «начал делать» → start_task.
- «закрой задачу» → complete_task; результат после запятой → completionResult.
- «отмени задачу» → cancel_task; причина → cancellationReason.
- «дедлайн», «до <дата>» для задачи → set_task_deadline.

Пример start_task:
Input: «Взял задачу Проверить склад в работу»
Output: {"intent":"start_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"Проверить склад"}}

Пример complete_task:
Input: «Закрой задачу Проверить склад, всё проверил»
Output: {"intent":"complete_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"Проверить склад","completionResult":"всё проверил"}}

Пример cancel_task:
Input: «Отмени задачу Проверить склад, склад закрыт»
Output: {"intent":"cancel_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"Проверить склад","cancellationReason":"склад закрыт"}}

Пример set_task_deadline:
Input: «Поставь дедлайн задаче Проверить склад на завтра»
Output: {"intent":"set_task_deadline","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"Проверить склад","deadlineDate":"2026-05-23"}}`;
