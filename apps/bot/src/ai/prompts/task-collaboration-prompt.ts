export const TASK_COLLABORATION_PROMPT = `Разрешённые intent: add_task_comment, mention_in_task, transfer_task, reassign_task.

add_task_comment.payload: { "taskQuery"?: string, "taskTitle"?: string, "comment"?: string, "taskId"?: string }
mention_in_task.payload: { "userHint": string, "taskTitle": string, "text"?: string }
transfer_task.payload: { "taskTitle": string, "toUserHint": string, "comment"?: string }
reassign_task.payload: { "taskTitle": string, "fromUserHint"?: string, "toUserHint": string, "comment"?: string }

Правила:
- transfer_task — один новый исполнитель («передай задачу X Васе», «мне» → "__self__").
- reassign_task — «с X на Y», «перекинь с Васи на Машу», «переназначь».
- «перекинь задачу {task} на {user}» — toUserHint = {user}, taskTitle = {task} (не включай «на {user}» в taskTitle).
- taskTitle / taskQuery может быть неполным; resolver найдёт похожую задачу.

add_task_comment — всегда разделяй:
- taskQuery: слова, которые описывают задачу, куда добавить комментарий;
- comment: текст, который нужно сохранить как комментарий в задаче.

Правила add_task_comment:
- В comment не включай слова «комментарий», «добавь комментарий», «напиши комментарий», «к задаче», «в задаче», «по задаче».
- В comment не включай часть, которая нужна только для поиска задачи.
- Если пользователь явно использует «что», текст после «что» обычно comment.
- Если пользователь использует двоеточие, текст после двоеточия обычно comment.
- Если непонятно, где comment — верни comment пустым (не подставляй весь ввод пользователя).
- Не придумывай taskQuery, если задача не указана.

Примеры add_task_comment:

Input: «комментарий в квартальном отчете к понедельнику нужен кровь из носа»
Output: {"intent":"add_task_comment","confidence":0.9,"requiresConfirmation":true,"payload":{"taskQuery":"квартальный отчет","comment":"к понедельнику нужен кровь из носа"}}

Input: «напиши комментарий к задаче по квартальному отчету, что к понедельнику нужен кровь из носа»
Output: {"intent":"add_task_comment","confidence":0.9,"requiresConfirmation":true,"payload":{"taskQuery":"квартальный отчет","comment":"к понедельнику нужен кровь из носа"}}

Input: «комментарий к квартальному отчету жду сегодня»
Output: {"intent":"add_task_comment","confidence":0.9,"requiresConfirmation":true,"payload":{"taskQuery":"квартальный отчет","comment":"жду сегодня"}}

Input: «добавь комментарий в задачу по складу что нужна проверка от Васи»
Output: {"intent":"add_task_comment","confidence":0.9,"requiresConfirmation":true,"payload":{"taskQuery":"склад","comment":"нужна проверка от Васи"}}

Input: «по отчету добавь что нужно закрыть до конца дня»
Output: {"intent":"add_task_comment","confidence":0.9,"requiresConfirmation":true,"payload":{"taskQuery":"отчет","comment":"нужно закрыть до конца дня"}}

Input: «комментарий к задаче склад: нужна проверка от Васи»
Output: {"intent":"add_task_comment","confidence":0.9,"requiresConfirmation":true,"payload":{"taskQuery":"склад","comment":"нужна проверка от Васи"}}

Пример mention_in_task:
Input: «Позови Васю в задачу Проверить склад, нужны его комментарии»
Output: {"intent":"mention_in_task","confidence":0.9,"requiresConfirmation":true,"payload":{"userHint":"Вася","taskTitle":"Проверить склад","text":"нужны его комментарии"}}

Пример transfer_task:
Input: «Передай задачу Проверить склад Васе, он отвечает за склад»
Output: {"intent":"transfer_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"Проверить склад","toUserHint":"Вася","comment":"он отвечает за склад"}}

Пример reassign_task:
Input: «Перекинь задачу проверить склад с Пети на Машу»
Output: {"intent":"reassign_task","confidence":0.9,"requiresConfirmation":true,"payload":{"taskTitle":"проверить склад","fromUserHint":"Петя","toUserHint":"Маша"}}`;
