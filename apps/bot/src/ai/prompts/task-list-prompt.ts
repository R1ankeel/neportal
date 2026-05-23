export const TASK_LIST_PROMPT = `Разрешённые intent: list_my_tasks, list_user_tasks, list_pending_expenses.

list_my_tasks.payload: {}
list_user_tasks.payload: { "userHint": string }
list_pending_expenses.payload: {}

Правила:
- «мои задачи», «что мне сделать» → list_my_tasks.
- «задачи у Васи», «чем занят Петр» → list_user_tasks (userHint как в тексте).
- «неподтвержденные расходы», «расходы без чеков», «чеки к расходам» → list_pending_expenses.
- requiresConfirmation: false.

Пример list_my_tasks:
Input: «покажи мои задачи»
Output: {"intent":"list_my_tasks","confidence":0.9,"requiresConfirmation":false,"payload":{}}

Пример list_user_tasks:
Input: «Какие сейчас задачи у Васи?»
Output: {"intent":"list_user_tasks","confidence":0.9,"requiresConfirmation":false,"payload":{"userHint":"Васи"}}

Пример list_pending_expenses:
Input: «мои неподтвержденные расходы»
Output: {"intent":"list_pending_expenses","confidence":0.9,"requiresConfirmation":false,"payload":{}}`;
