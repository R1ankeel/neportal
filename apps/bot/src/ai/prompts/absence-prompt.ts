export const ABSENCE_PROMPT = `Intents: create_absence, cancel_absence.

create_absence: { userHint?, type: SICK_LEAVE|VACATION, startDate?, endDate?, documentNumber?, comment? }
cancel_absence: { userHint?, type?, cancellationReason? }

Правила: «я/мне» → userHint "__self__"; больничный → SICK_LEAVE, отпуск → VACATION; «с завтра до понедельника» → startDate/endDate по контексту даты.

Пример: «добавь мне отпуск с завтра до понедельника»
→ {"intent":"create_absence","confidence":0.9,"requiresConfirmation":true,"payload":{"userHint":"__self__","type":"VACATION","startDate":"2026-05-25","endDate":"2026-05-25"}}

Пример: «Я заболел до пятницы»
→ {"intent":"create_absence","confidence":0.9,"requiresConfirmation":true,"payload":{"userHint":"__self__","type":"SICK_LEAVE","endDate":"2026-05-29"}}`;
