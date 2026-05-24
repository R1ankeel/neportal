export const TASK_LIST_PROMPT = `Intents: list_my_tasks, list_user_tasks, list_pending_expenses.

list_my_tasks: {}
list_user_tasks: { userHint }
list_pending_expenses: {}

Правила: «мои задачи» → list_my_tasks; «задачи у X» → list_user_tasks; «расходы без чеков» → list_pending_expenses; requiresConfirmation: false.

Пример: «покажи задачи Маши» → {"intent":"list_user_tasks","confidence":0.9,"requiresConfirmation":false,"payload":{"userHint":"Маши"}}`;
