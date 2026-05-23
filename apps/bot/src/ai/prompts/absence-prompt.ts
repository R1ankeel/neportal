export const ABSENCE_PROMPT = `Разрешённые intent: create_absence, cancel_absence.

create_absence.payload:
{ "userHint"?: string, "type": "SICK_LEAVE" | "VACATION", "startDate"?: "YYYY-MM-DD", "endDate"?: "YYYY-MM-DD", "documentNumber"?: string, "comment"?: string }

cancel_absence.payload:
{ "userHint"?: string, "type"?: "SICK_LEAVE" | "VACATION", "cancellationReason"?: string }

Правила:
- «я заболел», «мой больничный», «у меня отпуск» → userHint "__self__".
- «Ваня заболел» → userHint имя из текста.
- SICK_LEAVE для больничного, VACATION для отпуска.

Пример create_absence:
Input: «Я заболел. Больничный до 25.05.2026»
Output: {"intent":"create_absence","confidence":0.9,"requiresConfirmation":true,"payload":{"userHint":"__self__","type":"SICK_LEAVE","endDate":"2026-05-25"}}

Пример create_absence:
Input: «Маша уходит в отпуск с 01.06.2026 по 10.06.2026»
Output: {"intent":"create_absence","confidence":0.9,"requiresConfirmation":true,"payload":{"userHint":"Маша","type":"VACATION","startDate":"2026-06-01","endDate":"2026-06-10"}}

Пример cancel_absence:
Input: «удали мой больничный»
Output: {"intent":"cancel_absence","confidence":0.9,"requiresConfirmation":true,"payload":{"userHint":"__self__","type":"SICK_LEAVE"}}

Пример cancel_absence:
Input: «отмени отпуск Васи»
Output: {"intent":"cancel_absence","confidence":0.9,"requiresConfirmation":true,"payload":{"userHint":"Вася","type":"VACATION"}}`;
