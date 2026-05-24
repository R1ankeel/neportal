export const TASK_COLLABORATION_PROMPT = `Intents: add_task_comment, mention_in_task, transfer_task, reassign_task.

add_task_comment: { taskQuery?, taskTitle?, comment?, taskId? } — раздели поиск задачи и текст комментария; не клади «комментарий/к задаче» в comment; после «что»/«:» → comment.
mention_in_task: { userHint, taskTitle, text? }
transfer_task: { taskTitle, toUserHint, comment? } — «по складу Васе»: taskTitle=склад, toUserHint=Вася.
reassign_task: { taskTitle, fromUserHint?, toUserHint, comment? }

Пример comment: «комментарий в квартальном отчете к понедельнику нужен кровь из носа»
→ {"intent":"add_task_comment","confidence":0.9,"requiresConfirmation":true,"payload":{"taskQuery":"квартальный отчет","comment":"к понедельнику нужен кровь из носа"}}

Пример transfer: «Передай задачу по складу Сабирчику»
→ {"intent":"transfer_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"склад","toUserHint":"Сабирчик"}}`;
