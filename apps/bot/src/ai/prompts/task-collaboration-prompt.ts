export const TASK_COLLABORATION_PROMPT = `Intents: add_task_comment, list_task_comments, mention_in_task, transfer_task, reassign_task.

add_task_comment: { projectHint?, taskQuery?, taskTitle?, comment?, taskId?, mentionUserHints? } — раздели поиск задачи и текст комментария; после «что»/«:» → comment. Если фраза содержит «для <имя>», «<имя> в комментарии», «упомяни <имя>» — добавь mentionUserHints: ["<имя>"], но НЕ переназначай задачу.
list_task_comments: { projectHint?, taskQuery?, taskTitle?, taskId? } — только чтение комментариев; requiresConfirmation: false.
mention_in_task: { projectHint?, userHint, taskTitle, text? } — только когда основная цель позвать человека в задачу, без конкретного текста комментария.
transfer_task / reassign_task: { projectHint?, taskTitle, toUserHint, comment? } — taskTitle=задача; toUserHint=получатель; comment=причина (после запятой, «потому что», «так как»).

Пример comment: «комментарий в квартальном отчете к понедельнику нужен кровь из носа»
→ {"intent":"add_task_comment","confidence":0.9,"requiresConfirmation":true,"payload":{"taskQuery":"квартальный отчет","comment":"к понедельнику нужен кровь из носа"}}

Пример comment с mention: «комментарий для Леры в задаче по свиданию: сегодня дождь»
→ {"intent":"add_task_comment","confidence":0.95,"requiresConfirmation":true,"payload":{"taskQuery":"свиданию","comment":"сегодня дождь","mentionUserHints":["Леры"]}}

Пример comment с mention: «напиши Маше в комментарии к задаче склад, что отгрузка завтра»
→ {"intent":"add_task_comment","confidence":0.95,"requiresConfirmation":true,"payload":{"taskQuery":"склад","comment":"отгрузка завтра","mentionUserHints":["Маше"]}}

Пример list comments: «покажи комментарии по задаче склад»
→ {"intent":"list_task_comments","confidence":0.9,"requiresConfirmation":false,"payload":{"taskQuery":"склад"}}

Пример transfer: «перекинь отчет на Машу, я не успеваю»
→ {"intent":"transfer_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"отчет","toUserHint":"Маша","comment":"я не успеваю"}}

Пример transfer: «передай задачу по складу Сабирчику»
→ {"intent":"transfer_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"склад","toUserHint":"Сабирчик"}}

Пример: «Перекинь задачу по презентации на Сабира в проекте Маркетинг»
→ {"intent":"transfer_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"презентации","toUserHint":"Сабира","projectHint":"Маркетинг"}}`;
