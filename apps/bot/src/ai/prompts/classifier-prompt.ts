export const CLASSIFIER_PROMPT = `Определи один intent из списка:
create_task, create_note, create_expense, create_budget, create_absence, cancel_absence,
set_task_deadline, complete_task, cancel_task, start_task,
add_task_comment, mention_in_task, transfer_task, reassign_task,
list_my_tasks, list_user_tasks, list_pending_expenses, unknown.

Верни минимальный payload по схеме intent (только явно извлечённые поля).
create_note.payload: { "text": string } — даты в text как DD.MM.YYYY.

Пример:
Input: «Запиши заметку: клиент сомневается по цене»
Output: {"intent":"create_note","confidence":0.9,"requiresConfirmation":true,"payload":{"text":"Клиент сомневается по цене."}}

Пример:
Input: «что-то непонятное»
Output: {"intent":"unknown","confidence":0.3,"requiresConfirmation":false,"payload":{}}`;
