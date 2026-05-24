export const TASK_COLLABORATION_PROMPT = `Intents: add_task_comment, mention_in_task, transfer_task, reassign_task.

add_task_comment: { taskQuery?, taskTitle?, comment?, taskId? } — раздели поиск задачи и текст комментария; после «что»/«:» → comment.
mention_in_task: { userHint, taskTitle, text? }
transfer_task / reassign_task: { taskTitle, toUserHint, comment? } — taskTitle=задача; toUserHint=получатель; comment=причина (после запятой, «потому что», «так как»).

Пример comment: «комментарий в квартальном отчете к понедельнику нужен кровь из носа»
→ {"intent":"add_task_comment","confidence":0.9,"requiresConfirmation":true,"payload":{"taskQuery":"квартальный отчет","comment":"к понедельнику нужен кровь из носа"}}

Пример transfer: «перекинь отчет на Машу, я не успеваю»
→ {"intent":"transfer_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"отчет","toUserHint":"Маша","comment":"я не успеваю"}}

Пример transfer: «передай задачу по складу Сабирчику»
→ {"intent":"transfer_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"склад","toUserHint":"Сабирчик"}}`;
