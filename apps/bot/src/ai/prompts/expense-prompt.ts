export const EXPENSE_PROMPT = `Intents: create_expense, create_budget.

create_expense: { projectHint?, budgetHint?, amount, description? } — budgetHint только если назван бюджет.
create_budget: { projectHint?, name, amount, requiresReceipt? }

Пример: «Потратил 1500 на рекламу чек потом»
→ {"intent":"create_expense","confidence":0.9,"requiresConfirmation":true,"payload":{"amount":1500,"description":"реклама"}}

Пример: «Создай бюджет реклама 50000, чек обязателен»
→ {"intent":"create_budget","confidence":0.9,"requiresConfirmation":true,"payload":{"name":"Реклама","amount":50000,"requiresReceipt":true}}`;
