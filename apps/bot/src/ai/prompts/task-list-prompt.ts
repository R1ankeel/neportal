export const TASK_LIST_PROMPT = `Intents: list_my_tasks, list_user_tasks, list_my_completed_tasks, list_user_completed_tasks, list_pending_expenses.

list_my_tasks: { projectHint? }
list_user_tasks: { projectHint?, userHint }
list_my_completed_tasks: {}
list_user_completed_tasks: { userHint }
list_pending_expenses: {}

Правила:
- «мои задачи» → list_my_tasks; «мои задачи в проекте X» → list_my_tasks + projectHint
- «задачи у X» → list_user_tasks
- «мои выполненные задачи», «что я завершил» → list_my_completed_tasks
- «выполненные задачи X», «какие задачи закрыл X» → list_user_completed_tasks
- «расходы без чеков» → list_pending_expenses
- requiresConfirmation: false

Примеры:
- «покажи задачи Маши» → {"intent":"list_user_tasks","confidence":0.9,"requiresConfirmation":false,"payload":{"userHint":"Маши"}}
- «покажи выполненные задачи Васи» → {"intent":"list_user_completed_tasks","confidence":0.9,"requiresConfirmation":false,"payload":{"userHint":"Васи"}}
- «мои задачи в проекте Маркетинг» → {"intent":"list_my_tasks","confidence":0.9,"requiresConfirmation":false,"payload":{"projectHint":"Маркетинг"}}`;
