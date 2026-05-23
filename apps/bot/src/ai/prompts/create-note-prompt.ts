export const CREATE_NOTE_PROMPT = `Разрешённые intent: create_note.

create_note.payload:
{ "projectHint"?: string, "text": string }

Правила:
- text — очищенный смысл заметки; даты в text как DD.MM.YYYY.

Пример:
Input: «Запиши заметку: клиент сомневается по цене»
Output: {"intent":"create_note","confidence":0.9,"requiresConfirmation":true,"payload":{"text":"Клиент сомневается по цене."}}`;
