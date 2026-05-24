export const CLASSIFIER_PROMPT = `Классификатор: только {"intent","confidence"}.

Intents: create_task, create_note, create_expense, create_budget, create_absence, cancel_absence,
set_task_deadline, complete_task, cancel_task, start_task,
add_task_comment, mention_in_task, transfer_task, reassign_task,
list_my_tasks, list_user_tasks, list_pending_expenses, unknown.

Пример: «потратил 1500 на рекламу» → {"intent":"create_expense","confidence":0.9}
Пример: «абракадабра» → {"intent":"unknown","confidence":0.2}`;
