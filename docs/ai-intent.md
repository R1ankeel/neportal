# AI intent (YandexGPT + `@neportal/ai-contracts`)

Локальный MVP: Yandex Cloud используется **только как внешний API** (YandexGPT для текста; SpeechKit — позже). Бот и API работают на `localhost`, без деплоя в Yandex.

## Архитектура разбора текста

Обычный текст в боте проходит **три слоя** (см. также [bot.md](bot.md#детерминированный-разбор-без-yandexgpt)):

1. **Pending-состояния** — ответы «да/нет», номер задачи, уточнение комментария и т.д. (без GPT).
2. **Детерминированные парсеры** — регулярные шаблоны и эвристики в `ai-message.ts` (списки задач, расходы, простое «создай задачу…», transfer/reassign) — **без** YandexGPT.
3. **YandexGPT** — двухэтапный разбор для остальных фраз (если env настроен).

```mermaid
sequenceDiagram
  participant U as Telegram user
  participant B as apps/bot
  participant Y as YandexGPT API
  participant A as apps/api

  U->>B: обычный текст
  B->>B: pending / deterministic parsers
  alt deterministic match
    B->>B: routeParsedAiIntent
  else needs GPT
    B->>A: GET projects, users, budgets, tasks
    B->>Y: classifier (optional)
    Y-->>B: intent name
    B->>Y: extractor promptGroup + context
    Y-->>B: JSON intent
    B->>B: fixAiIntent + Zod + validateIntentForRouting
  end
  B->>B: resolve hints
  B-->>U: preview, да/нет?
  U->>B: да
  B->>A: POST notes / tasks / ...
  B-->>U: результат
```

Slash-команды (`/task`, `/note`, …) **не** проходят через YandexGPT.

### Маршрутизация промптов (`resolvePromptGroup`)

Файл: `apps/bot/src/ai/prompt-group-router.ts`.

По тексту пользователя бот выбирает **группу промпта** (`expense`, `absence`, `task-status`, `collaboration`, `task-list`, `create-task-rich`, `create-note` или `classifier`). Если группа **не** `classifier`, шаг classifier в YandexGPT **пропускается** — сразу вызывается extractor этой группы.

Примеры маршрутизации без classifier: фразы про «мои задачи», «расходы без чеков», явное «потратил …», «создай задачу …» (богатый шаблон).

### Двухэтапный YandexGPT

Реализация: `apps/bot/src/yandex-gpt.ts`, промпты: `apps/bot/src/ai/prompts/`.

| Шаг | Что делает |
|-----|------------|
| 1. Classifier | Короткий JSON: только `intent` + `confidence` (если `resolvePromptGroup` вернул `classifier`) |
| 2. Extractor | Полный JSON по группе (`expense`, `collaboration`, …) с контекстом из API |
| Post-process | `fixAiIntentBeforeValidation` (даты, assignee «мне», …) |
| Validate | Zod (`safeParseAiIntent`) + `validateIntentForRouting` (в т.ч. `add_task_comment`) |

Группы extractor ↔ intent: `intentToExtractorGroup()` в `apps/bot/src/ai/intent-to-prompt-group.ts`.

### Логирование токенов и отладка

- В консоли бота: `[yandex-gpt] tokens promptGroup=… input=… output=…` и итог `parseTextIntent total` (`yandex-gpt-usage.ts`).
- При отказе модели или невалидной схеме — сохранение промпта в `BOT_YANDEX_PROMPT_LOG_DIR` (по умолчанию `logs/yandex-gpt` в cwd бота).
- `BOT_DEV_SELF_CHECKS=true` — self-checks при старте; `BOT_AI_CLEANUP_BASIC_TASKS` — опциональная LLM-очистка title для коротких deterministic `create_task`.

### Местоимения и `__self__`

Если пользователь говорит о себе («мне», «меня», «себе», «на меня»), модель возвращает `assigneeHint` / `toUserHint` / `userHint` = `"__self__"`. Бот подставляет привязанного сотрудника.

### create_task: исполнитель vs имена в задаче

- **assigneeHint** — только кому назначают задачу («поставь Васе», «поручи Ивану», «мне» → `__self__`).
- Имена **внутри действия** («уволить Васю», «позвонить Ивану») — часть `title`, не исполнитель.
- После YandexGPT для `create_task` срабатывает post-processing (`fix-ai-intent-assignee.ts`): фразы вроде «поставь мне задачу», «запиши мне в задачи» принудительно ставят `assigneeHint: "__self__"`, даже если модель ошибочно взяла имя из title.

Пример:

> Поставь мне задачу проверить склад завтра

```json
{
  "intent": "create_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "assigneeHint": "__self__",
    "title": "Проверить склад",
    "deadlineDate": "2026-05-23"
  }
}
```

### Неоднозначный сотрудник

Если по hint найдено несколько сотрудников (например «Ване» и два Ивана), бот **не** выбирает автоматически — показывает нумерованный список и ждёт номер (см. [bot.md](bot.md#поиск-сотрудника-user-resolution-flow-v1)).

## Контракт JSON

Пакет: `packages/ai-contracts` (Zod).

```typescript
{
  intent: "create_task" | "create_note" | "create_expense" | "create_budget" | "create_absence" | "cancel_absence" | "set_task_deadline" | "complete_task" | "cancel_task" | "start_task" | "add_task_comment" | "mention_in_task" | "transfer_task" | "reassign_task" | "list_my_tasks" | "list_user_tasks" | "list_pending_expenses" | "unknown",
  confidence: number,        // 0..1
  requiresConfirmation: boolean,
  payload: object            // зависит от intent
}
```

Legacy-поля `version`, `action`, `entity` **не используются**. `preprocessAiIntentInput()` удаляет их, если модель вернула по ошибке.

### Payload по intent

| intent | payload |
|--------|---------|
| `create_task` | `projectHint?`, `assigneeHint?`, `title`, `description?`, `deadlineDate?` (ISO) |
| `create_note` | `projectHint?`, `text` (в тексте даты — **DD.MM.YYYY**) |
| `create_expense` | `projectHint?`, `budgetHint?`, `amount`, `description?` |
| `create_budget` | `projectHint?`, `name`, `amount`, `requiresReceipt?`, `matchingKeywords?` |
| `create_absence` | `userHint?`, `type`: `SICK_LEAVE` \| `VACATION`, `startDate?`, `endDate`, `documentNumber?`, `comment?` |
| `cancel_absence` | `userHint?`, `type?`: `SICK_LEAVE` \| `VACATION`, `cancellationReason?` |
| `set_task_deadline` | `taskTitle`, `deadlineDate` (ISO) |
| `complete_task` | `taskTitle`, `completionResult?` |
| `cancel_task` | `taskTitle`, `cancellationReason?` |
| `start_task` | `taskTitle` |
| `add_task_comment` | `taskQuery?`, `taskTitle?`, `taskId?`, `comment?` (legacy `text?`) |
| `mention_in_task` | `userHint`, `taskTitle`, `text?` |
| `transfer_task` | `taskTitle`, `toUserHint`, `comment?` |
| `reassign_task` | `taskTitle`, `fromUserHint?`, `toUserHint`, `comment?` |
| `list_my_tasks` | `{}` (пустой) |
| `list_user_tasks` | `userHint` (имя сотрудника; `__self__` → свои задачи) |
| `list_pending_expenses` | `{}` (пустой) |
| `unknown` | `reason?` |

### Пример: закрыть задачу (без результата в фразе)

> Закрой задачу поехать к поставщику

```json
{
  "intent": "complete_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Поехать к поставщику" }
}
```

Бот спросит: *«Что сделано по задаче «…»?»*, затем confirmation.

### Пример: взять задачу в работу

> Взял задачу Проверить склад в работу

```json
{
  "intent": "start_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад" }
}
```

Confirmation: *«Взять задачу «Проверить склад» в работу?»* → `PATCH` `IN_PROGRESS`.

### Пример: закрыть задачу с результатом

> Закрой задачу Проверить склад, всё проверил

```json
{
  "intent": "complete_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "taskTitle": "Проверить склад",
    "completionResult": "всё проверил"
  }
}
```

### Пример: отменить задачу (без причины)

> Отмени задачу проверить склад

```json
{
  "intent": "cancel_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад" }
}
```

### Пример: отменить задачу с причиной

> Отмени задачу Проверить склад, склад закрыт

```json
{
  "intent": "cancel_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "taskTitle": "Проверить склад",
    "cancellationReason": "склад закрыт"
  }
}
```

### Пример: комментарий к задаче (с текстом)

> Напиши комментарий к задаче Проверить склад: склад закрыт до завтра

```json
{
  "intent": "add_task_comment",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "taskTitle": "Проверить склад",
    "text": "склад закрыт до завтра"
  }
}
```

### Пример: комментарий без текста в фразе

> Напиши комментарий к задаче Проверить склад

```json
{
  "intent": "add_task_comment",
  "confidence": 0.85,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад" }
}
```

Бот спросит: *«Что написать в комментарии к задаче «…»?»*, затем confirmation.

### add_task_comment: bot-level validation (после LLM)

YandexGPT может вернуть формально валидный JSON, где `comment` совпадает с целой фразой пользователя. Перед routing бот вызывает `validateIntentForRouting` → `validateAddTaskCommentPayload`:

- нормализация строк (trim, схлопывание пробелов);
- если `comment` пустой или почти равен `userText` при известной задаче — recovery: явные разделители (`:`, «, что», « что », « с текстом ») или хвост `userText` после fuzzy-вхождения `taskQuery`/`taskTitle` (stem из `task-search-text.ts`);
- если recovery не удался — `needsComment` → бот спрашивает: *«Какой комментарий добавить?»*;
- если нет `taskQuery` / `taskTitle` / `taskId` — `needsTaskQuery` → *«К какой задаче добавить комментарий?»*;
- в preview и в БД сохраняется очищенный `comment`, не исходная команда.

Edit-flow (`pendingConfirmationEdit`) для поля «Комментарий» не прогоняет текст через recovery (пустой `userText`).

### Пример: призвать в задачу (с текстом)

> Позови Васю в задачу Проверить склад, нужны его комментарии

```json
{
  "intent": "mention_in_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "userHint": "Вася",
    "taskTitle": "Проверить склад",
    "text": "нужны его комментарии"
  }
}
```

Confirmation: *«Позвать Вася Пупкин в задачу «…»? Комментарий: …»*

### Пример: призвать без текста

> Попроси Петра прокомментировать задачу Реклама VK

```json
{
  "intent": "mention_in_task",
  "confidence": 0.85,
  "requiresConfirmation": true,
  "payload": { "userHint": "Петр", "taskTitle": "Реклама VK" }
}
```

Бот спросит: *«Что написать в комментарии для … по задаче «…»?»*, затем confirmation.

### Пример: передача задачи

> Передай задачу Проверить склад Васе, потому что он отвечает за склад

```json
{
  "intent": "transfer_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "taskTitle": "Проверить склад",
    "toUserHint": "Вася",
    "comment": "потому что он отвечает за склад"
  }
}
```

OWNER/MANAGER: задача передаётся сразу после «да». EMPLOYEE: запрос на принятие новому исполнителю.

### Пример: переназначение задачи (reassign_task)

> Перекинь задачу по поездке к подрядчику с Васи на Машу

```json
{
  "intent": "reassign_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "taskTitle": "по поездке к подрядчику",
    "fromUserHint": "Вася",
    "toUserHint": "Маша"
  }
}
```

Только OWNER/MANAGER. Отличие от `transfer_task`: формулировка «с X на Y» / «перекинь» / «переназначь». После «да» — сразу смена исполнителя и уведомления старому, новому и постановщику.

### Пример: мои задачи (без confirmation)

> покажи мои задачи

```json
{
  "intent": "list_my_tasks",
  "confidence": 0.9,
  "requiresConfirmation": false,
  "payload": {}
}
```

Бот сразу вызывает `GET /tasks/my?userId=<linked>&limit=5` и отправляет список (без «да/нет»).

### Пример: задачи сотрудника (OWNER/MANAGER)

> Какие задачи у Васи?

```json
{
  "intent": "list_user_tasks",
  "confidence": 0.9,
  "requiresConfirmation": false,
  "payload": { "userHint": "Вася" }
}
```

Бот проверяет роль (OWNER/MANAGER), разрешает `userHint` через User Resolution; при нескольких совпадениях — `select_user_for_task_list`, затем `GET /tasks/my?userId=<выбранный>&limit=5`. EMPLOYEE при запросе чужих задач получает отказ.

### Пример: заметка

Запрос пользователя:

> Запиши заметку: клиент попросил завтра проверить статистику VK

Ожидаемый ответ модели:

```json
{
  "intent": "create_note",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "text": "клиент попросил 22.05.2026 проверить статистику VK"
  }
}
```

Бот дополнительно нормализует ISO-даты в `text` → `22.05.2026` перед сохранением.

## API YandexGPT

- Endpoint: `https://llm.api.cloud.yandex.net/foundationModels/v1/completion`
- Реализация: `apps/bot/src/yandex-gpt.ts`
- Auth (приоритет):
  1. `YANDEX_GPT_API_KEY` → `Authorization: Api-Key <key>`
  2. иначе `YANDEX_CLOUD_IAM_TOKEN` → `Authorization: Bearer <token>`
- Заголовок `x-folder-id`: `YANDEX_CLOUD_FOLDER_ID`

В prompt передаются: текущая дата (UTC ISO), списки проектов, пользователей, бюджетов и задач из REST API — для сопоставления «Вася» → «Вася Пупкин», «реклама VK» → проект/бюджет.

## Загрузка схемы в боте

`apps/bot/src/ai-contracts.ts` подключает собранный `packages/ai-contracts/dist/index.js` по относительному пути, чтобы не попасть на устаревшую копию в `apps/bot/node_modules`.

Перед `pnpm --filter @neportal/bot dev` скрипт `dev` собирает `@neportal/ai-contracts`.

## Функции пакета

| Экспорт | Описание |
|---------|----------|
| `AiIntentSchema` | Zod discriminated union по `intent` |
| `safeParseAiIntent` | Безопасный parse + preprocess |
| `parseAiIntent` | Parse с throw |
| `preprocessAiIntentInput` | Очистка legacy-полей, coerce `confidence` |

## Проверка локально

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm --filter @neportal/api dev
pnpm --filter @neportal/web dev
pnpm --filter @neportal/bot dev
```

1. Slash: `/note Тест` — без Yandex.
2. Текст с настроенным Yandex → preview → `да` → запись в Web (проект «Реклама VK»).

См. также: [bot.md](bot.md), [packages.md](packages.md).
