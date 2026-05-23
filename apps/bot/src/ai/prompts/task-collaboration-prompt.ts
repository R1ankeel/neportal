export const TASK_COLLABORATION_PROMPT = `Разрешённые intent: add_task_comment, mention_in_task, transfer_task, reassign_task.

add_task_comment.payload: { "taskTitle": string, "text"?: string }
mention_in_task.payload: { "userHint": string, "taskTitle": string, "text"?: string }
transfer_task.payload: { "taskTitle": string, "toUserHint": string, "comment"?: string }
reassign_task.payload: { "taskTitle": string, "fromUserHint"?: string, "toUserHint": string, "comment"?: string }

Правила:
- transfer_task — один новый исполнитель («передай задачу X Васе», «мне» → "__self__").
- reassign_task — «с X на Y», «перекинь с Васи на Машу», «переназначь».
- add_task_comment — текст после «:» или «, что …»; без текста — только taskTitle.
- mention_in_task — «позови», «призови» + userHint + taskTitle.

Пример add_task_comment:
Input: «Напиши комментарий к задаче Проверить склад: склад закрыт до завтра»
Output: {"intent":"add_task_comment","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"Проверить склад","text":"склад закрыт до завтра"}}

Пример mention_in_task:
Input: «Позови Васю в задачу Проверить склад, нужны его комментарии»
Output: {"intent":"mention_in_task","confidence":0.9,"requiresConfirmation":true,"payload":{"userHint":"Вася","taskTitle":"Проверить склад","text":"нужны его комментарии"}}

Пример transfer_task:
Input: «Передай задачу Проверить склад Васе, он отвечает за склад»
Output: {"intent":"transfer_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"Проверить склад","toUserHint":"Вася","comment":"он отвечает за склад"}}

Пример reassign_task:
Input: «Перекинь задачу проверить склад с Пети на Машу»
Output: {"intent":"reassign_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"проверить склад","fromUserHint":"Петя","toUserHint":"Маша"}}`;
