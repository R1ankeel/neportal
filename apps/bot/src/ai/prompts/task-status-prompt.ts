export const TASK_STATUS_PROMPT = `Intents: start_task, complete_task, cancel_task, set_task_deadline.

Payload:
- start_task: { projectHint?, taskTitle }
- complete_task: { projectHint?, taskTitle, completionResult? }
- cancel_task: { projectHint?, taskTitle, cancellationReason? }
- set_task_deadline: { projectHint?, taskTitle, deadlineDate }

Правила: taskTitle — без «задачу»; «закрыл/завершил/сделал/готово» → complete_task; текст после запятой → completionResult; «начал/беру в работу» → start_task; «отмени» → cancel_task.

Пример: «Закрыл задачу по складу, проверил остатки»
→ {"intent":"complete_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"склад","completionResult":"проверил остатки"}}

Пример: «Начни задачу по складу»
→ {"intent":"start_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"склад"}}`;
