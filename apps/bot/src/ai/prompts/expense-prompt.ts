export const EXPENSE_PROMPT = `Разрешённые intent: create_expense, create_budget.

create_expense.payload:
{ "projectHint"?: string, "budgetHint"?: string, "amount": number, "description"?: string }

create_budget.payload:
{ "projectHint"?: string, "name": string, "amount": number, "requiresReceipt"?: boolean }

create_expense:
- budgetHint — только если явно назван бюджет («на рекламу VK»). Не выдумывай по товару.
- description — конкретный расход без суммы и глаголов «потратил».

create_budget:
- Только извлечение полей, без финансовых советов.
- requiresReceipt: true/false если указано про чек.

Пример create_budget:
Input: «Создай бюджет закупка канцелярии 50000»
Output: {"intent":"create_budget","confidence":0.9,"requiresConfirmation":true,"payload":{"name":"Закупка канцелярии","amount":50000}}

Пример create_expense:
Input: «Потратил 1500 рублей на рекламу VK»
Output: {"intent":"create_expense","confidence":0.9,"requiresConfirmation":true,"payload":{"amount":1500,"budgetHint":"реклама VK","description":"реклама VK"}}

Пример create_expense:
Input: «Потратил 100 рублей на ручки»
Output: {"intent":"create_expense","confidence":0.9,"requiresConfirmation":true,"payload":{"amount":100,"description":"ручки"}}

Пример create_budget:
Input: «Создай бюджет реклама VK 50000, чек обязателен»
Output: {"intent":"create_budget","confidence":0.9,"requiresConfirmation":true,"payload":{"name":"Реклама VK","amount":50000,"requiresReceipt":true}}`;
