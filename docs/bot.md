# Telegram-бот (`apps/bot`)

Общий контекст и карта репозитория: [developer-guide.md](developer-guide.md).

Стек: **grammY**, TypeScript, long polling по умолчанию.

## Настройка

В **корневом** `.env`:

```env
TELEGRAM_BOT_TOKEN=<токен от BotFather>
API_URL=http://localhost:4000
BOT_MODE=polling
```

Для webhook:

```env
BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://your-host/telegram/webhook
```

Запуск (перед `tsx` собирается `@neportal/ai-contracts`):

```bash
pnpm --filter @neportal/bot dev
```

При старте вызывается `loadRootEnv()` из `@neportal/shared` (как в API).

### AI-парсер (опционально)

Разбор **обычного текста** без slash-команд идёт через абстракцию **`AiProvider`** (`apps/bot/src/ai/provider/`). Провайдер выбирается переменной **`AI_PROVIDER`** (по умолчанию `yandex`). См. [ai-intent.md](ai-intent.md).

#### `AI_PROVIDER=yandex` (по умолчанию)

YandexGPT Foundation Models API в **корневом** `.env`:

```env
AI_PROVIDER=yandex
YANDEX_CLOUD_FOLDER_ID=<folder-id>
YANDEX_GPT_API_KEY=<ключ вида y0__...>
# или YANDEX_CLOUD_IAM_TOKEN=  (Bearer, если API key не задан)
YANDEX_GPT_MODEL_URI=gpt://<folder-id>/yandexgpt/latest
```

| Переменная | Назначение |
|------------|------------|
| `YANDEX_CLOUD_FOLDER_ID` | Каталог Yandex Cloud, заголовок `x-folder-id` |
| `YANDEX_GPT_API_KEY` | `Authorization: Api-Key` (**приоритет**) |
| `YANDEX_CLOUD_IAM_TOKEN` | `Authorization: Bearer`, если API key пуст |
| `YANDEX_GPT_MODEL_URI` | URI модели; если `change_me` — `gpt://{folder}/yandexgpt/latest` |

При старте (без секретов): `[yandex-gpt] auth mode: api-key` или `iam-token`.

#### `AI_PROVIDER=qwen`

Qwen через **Yandex Cloud AI Studio** (OpenAI-compatible `chat/completions`):

```env
AI_PROVIDER=qwen
QWEN_API_KEY=<полный_secret_ключ_из_yc>
QWEN_BASE_URL=https://ai.api.cloud.yandex.net/v1
QWEN_AUTH_TYPE=api-key
QWEN_MODEL=gpt://<FOLDER_ID>/<QWEN_MODEL_ID>/latest
```

`QWEN_*` **не используются**, пока `AI_PROVIDER` не равен `qwen`. Неизвестное значение `AI_PROVIDER` → предупреждение в лог и fallback на `yandex`.

#### Общее

Значения `change_me` и пустые строки считаются «не задано». Если выбранный provider не настроен — slash-команды работают; на произвольный текст: *«AI-парсер пока не настроен. Используйте команды /demo.»*

В логах completion (префикс `[yandex-gpt]` сохранён для совместимости): `provider=yandex|qwen`, `promptGroup`, `maxTokens`, `latencyMs`, токены.

Подробнее о контракте JSON → [ai-intent.md](ai-intent.md).

## Telegram UX: inline-кнопки

Текстовые сценарии подтверждения и выбора из списка дополнены **inline-кнопками**: меньше ошибок при вводе, быстрее взаимодействие, подготовка к голосовому вводу (SpeechKit). **Текстовый ввод сохранён** как fallback — пользователь по-прежнему может писать `да`, `нет`, `изменить`, `1`, `2`, `отмена` и другие поддерживаемые варианты.

Подробнее о AI-контракте и postprocess дедлайнов: [ai-intent.md](ai-intent.md).

### Confirmation flow

Для preview-сценариев (бот показывает предварительный результат и ждёт решения) под сообщением — кнопки **Подтвердить**, **Изменить**, **Отменить**:

- создание задачи;
- добавление расхода;
- добавление комментария;
- изменение статуса задачи;
- изменение дедлайна;
- упоминание сотрудника в задаче;
- передача или переназначение задачи;
- создание заметки / бюджета;
- больничный / отпуск и отмена отсутствия;
- распределение задач при отсутствии (`confirm_absence_delegation_distribution`);
- другие confirmation-сценарии через общий preview flow.

Модули: `telegram/keyboards/confirmation-keyboard.ts`, `confirmation-callback.ts`, `confirmation-decision.ts`, `confirmation-reply.ts`.

**Callback не содержит business payload** — только ссылка на pending confirmation в состоянии бота:

```text
confirmation:confirm:<telegramUserId>:<confirmationId>
confirmation:edit:<telegramUserId>:<confirmationId>
confirmation:cancel:<telegramUserId>:<confirmationId>
```

**Защита:** `telegramUserId` и `confirmationId` в callback сверяются с текущим pending; чужой пользователь не подтверждает чужое действие; старое сообщение с кнопками не применяется к новому pending; повторное нажатие после обработки не создаёт дубль; устаревший callback обрабатывается безопасно (no-op).

**Текстовый fallback** (`confirmation.ts`):

| Действие | Поддерживаемые ответы |
|----------|------------------------|
| Подтверждение | `да`, `yes`, `y`, `ок`, `ok`, `подтвердить`, `подтверждаю`, `+` |
| Редактирование | `изменить`, `исправить`, `редактировать`, `поменять` |
| Отмена | `нет`, `no`, `-`, `отмена`, `отмени`, `отменить`, `cancel`, `стоп`, `не добавлять` (для расхода) |

Для `create_expense` ответ **нет** по-прежнему означает **выбор другого бюджета**, не отмену (см. [Подтверждение расхода](#подтверждение-расхода-create_expense)).

Preview отправляется через `replyWithConfirmationPreview` — текст + `InlineKeyboard` с актуальным `confirmationId` из `pending-intent.ts`.

### Choice flow

Сценарии выбора из списка (раньше — «напишите номер 1, 2, 3…») показывают **нумерованные inline-кнопки** и **Отменить**:

- сотрудник (User Resolution);
- задача (task selection);
- бюджет;
- расход без чека (`pending-expenses`);
- пункты меню редактирования confirmation (edit-flow);
- другие сущности через общий choice-state.

Модули: `telegram/keyboards/choice-keyboard.ts`, `choice-callback.ts`, `choice-state.ts`, `choice-reply.ts`.

**Формат callback** (без объекта сущности и без полного payload действия):

```text
choice:select:<telegramUserId>:<choiceId>:<optionIndex>
choice:cancel:<telegramUserId>:<choiceId>
```

Список вариантов хранится в pending state; в callback передаются только индекс и guard-поля. Защита аналогична confirmation: чужой пользователь, устаревший `choiceId`, повторный callback, некорректный индекс — безопасный no-op без падения бизнес-логики.

**Текстовый fallback:** `1`, `2`, `3`, …; `отмена`, `отменить`, `cancel`, `стоп`.

### Edit-flow (confirmation)

Меню «Что редактируем?» (поля intent + «Сохранить без изменений» + «Отменить») — через **choice-layer** с теми же кнопками, что и нумерованный список. При выборе кнопкой вызывается тот же обработчик, что при вводе номера текстом; логика редактирования не дублируется.

Для `create_task` доступны поля: название, описание, исполнитель, дедлайн, проект, сохранить без изменений, отменить (`confirmation/editable-fields.ts`).

### Устойчивость callback-обработки

Telegram может вернуть ошибку на `answerCallbackQuery`, если кнопка устарела:

`400: Bad Request: query is too old and response timeout expired or query ID is invalid`

Обработка:

- `safeAnswerCallbackQuery` — истёкший/невалидный callback не валит процесс;
- ошибки снятия inline-кнопок (`safe-edit-message-reply-markup.ts`) не останавливают middleware;
- глобальный `bot.catch` (`telegram-error-log.ts`) — необработанные ошибки middleware;
- логи callback (`telegram/callback-log.ts`) — без секретов, токенов и полного контекста Telegram API.

В `main.ts` обработчик `bot.on("callback_query:data")` вызывает `handleChoiceCallback`, затем `handleConfirmationCallback` — **параллельно** с `message:text` (plain text идёт в `handlePlainTextMessage`).

**Исключение:** привязка по username через `/start` — подтверждение «да» / «нет» **только текстом** (отдельный pending в `start-binding.ts`, без общего confirmation-keyboard).

### Принципы реализации

1. Кнопки **не заменяют** текстовый ввод полностью — fallback для всех ключевых действий.
2. Callback **не содержит** business payload — только тип действия, `telegramUserId`, id pending-состояния и (для choice) индекс.
3. Бизнес-логика **не дублируется** — кнопки сводятся к `applyConfirmationDecision` / choice handlers.
4. `confirmationId` / `choiceId` защищают от старых кнопок в истории чата.
5. `telegramUserId` в callback защищает от чужих нажатий.
6. Ошибки Telegram callback **не валят** бот — просроченный query нормален в production.
7. Provider layer (YandexGPT / Qwen / `requestAiJson`) **не менялся** из-за UX-кнопок.

### Ручная проверка (чеклист)

- подтверждение создания задачи кнопкой;
- отмена создания задачи кнопкой;
- переход в изменение кнопкой;
- выбор поля редактирования кнопкой;
- изменение исполнителя через UI;
- выбор из списка кнопками;
- текстовый fallback: `да`, `отмена`, номер пункта;
- повторное / устаревшее нажатие — без дубля и без падения бота.

## Команды

| Команда | Действие |
|---------|----------|
| `/start` | Привязка Telegram по username из Web + краткая справка |
| `/me` | Статус привязки (ФИО, роль, @username) |
| `/link <ФИО>` | Привязка по имени (**dev**, без username в Web) |
| `/demo` | Полный список команд |
| `/task <текст>` | `POST /tasks` в проекте по умолчанию |
| `/note <текст>` | `POST /notes`, source `TELEGRAM_TEXT` |
| `/expense <сумма> <описание>` | `POST /budgets/:id/expenses` |
| `/sick до <дата> [номер <№>]` | `POST /absences` (`SICK_LEAVE`) |
| `/vacation с <дата> по <дата>` | `POST /absences` (`VACATION`) |
| `/cancel-absence` | `POST /absences/:id/cancel` — своё отсутствие |
| `/cancel-absence <сотрудник>` | то же для сотрудника (OWNER/MANAGER или своё) |
| `/delete-absence` | алиас `/cancel-absence` |
| `/deadline <название> <дата>` | `PATCH /tasks/:id/deadline` |
| `/start-task <название>` | `PATCH /tasks/:id/status` → `IN_PROGRESS` |
| `/work <название>` | то же, что `/start-task` |
| `/done <название>` | `PATCH /tasks/:id/status` → `DONE` |
| `/cancel <название>` | `PATCH /tasks/:id/status` → `CANCELLED` |
| `/comment <задача> — <текст>` | `POST /tasks/:id/comments`, source `TELEGRAM_TEXT` |
| `/mention <сотрудник> \| <задача> \| <текст>` | `POST /tasks/:id/comments/mention`, source `TELEGRAM_TEXT` |
| `/transfer <задача> \| <исполнитель> \| <комментарий>` | `POST /tasks/:id/transfers` |
| `/reassign <задача> \| <старый?> \| <новый> \| <комментарий>` | `POST /tasks/:id/transfers` (только OWNER/MANAGER) |
| `/tasks` | `GET /tasks/my?userId=…&limit=5` — мои задачи |
| `/tasks <сотрудник>` | то же API; только **OWNER** / **MANAGER** |

### Список задач

**Права:** `canViewOtherUsersTasks` — `true` для OWNER и MANAGER. Остальные видят только свои задачи; при запросе чужих: *«Вы можете смотреть только свои задачи.»*

**Slash:**

| Команда | Поведение |
|---------|-----------|
| `/tasks` | до 5 своих активных задач |
| `/tasks Вася` | задачи Васи (OWNER/MANAGER); неоднозначное имя → User Selection (`select_user_for_task_list`) |

**AI** (без confirmation):

| Текст | intent |
|-------|--------|
| покажи мои задачи | `list_my_tasks` |
| какие у меня задачи | `list_my_tasks` |
| что у меня по задачам | `list_my_tasks` |
| что мне нужно сделать | `list_my_tasks` |
| Какие задачи у Васи? | `list_user_tasks` + `userHint` |
| Покажи задачи Ивана | `list_user_tasks` |
| Что по задачам у Пети? | `list_user_tasks` |

`list_user_tasks` с `userHint` = `__self__` или «мне» → как `list_my_tasks`.

**Формат ответа:**

- Свои: заголовок *«Ваши ближайшие задачи:»*; пусто: *«У вас нет активных задач.»*
- Чужие (OWNER/MANAGER): *«Ближайшие задачи сотрудника {ФИО}:»*; пусто: *«У сотрудника {ФИО} нет активных задач.»*

В списке: проект, дедлайн (сегодня / завтра / DD.MM.YYYY / не указан), статус (Новая / В работе).

### Комментарии к задачам

**Slash:**

| Команда | Пример |
|---------|--------|
| `/comment` с текстом | `/comment Проверить склад — склад закрыт до завтра` (разделитель `—`, `-` или `:`) → preview с кнопками (или `да`) |
| `/comment` без текста | `/comment Проверить склад` → *«Что написать в комментарии к задаче «…»?»* → preview с кнопками (или `да`) |

**AI:**

| Текст | Поведение |
|-------|-----------|
| Напиши комментарий к задаче Проверить склад: склад закрыт | preview с `text` |
| Напиши комментарий к задаче Проверить склад | вопрос о тексте → preview |

**Pending comment details** (TTL 30 мин): `pending-task-comment-details.ts`. Отмена: *отмена*, *отмени*, *нет*, *стоп*.

**Selection:** тип `select_task_for_comment`; если `commentText` уже в payload — после выбора (кнопка или номер) сразу preview, иначе — уточняющий вопрос.

**Права (MVP):** постановщик, исполнитель, `OWNER`, `MANAGER` — те же, что для изменения задачи.

**Уведомления (без TaskNotificationLog):**

- комментарий от **исполнителя** → Telegram **постановщику** (если есть `telegramId` и это не автор);
- комментарий от **постановщика** → Telegram **исполнителю** (если есть `telegramId` и это не автор).

Текст: *«Новый комментарий к задаче «…». Автор: … Комментарий: …»*

В Web комментарий отображается с source **Telegram**.

### Призыв в задачу (mention)

**Slash** (разделители `|`, `—`, `-`):

| Команда | Пример |
|---------|--------|
| `/mention` | `/mention Вася \| Проверить склад \| нужны его комментарии` → preview с кнопками (или `да`) |
| `/mention` без текста | не поддерживается в slash (нужны три части) |

**AI:**

| Текст | Поведение |
|-------|-----------|
| Позови Васю в задачу Проверить склад, нужны его комментарии | поиск сотрудника + задачи → preview |
| Попроси Петра прокомментировать задачу Реклама VK | вопрос о тексте → preview |

**Pending mention details** (TTL 30 мин): `pending-task-mention-details.ts`, тип `awaiting_task_mention_text`. Отмена: *отмена*, *отмени*, *нет*, *стоп*.

**Selection:** тип `select_task_for_mention`; payload: `mentionedUserId`, `mentionedUserName`, `mentionText?`. После выбора (кнопка или номер) — preview или вопрос о тексте.

**Права:** те же, что для комментариев (постановщик, исполнитель, OWNER, MANAGER).

**Уведомление приглашённому** (без TaskNotificationLog):

```
{author.fullName} попросил вас прокомментировать задачу «{task.title}».

Проект: {project.name}
Комментарий: {text}
```

Если у сотрудника нет `telegramId` — комментарий и mention всё равно создаются; автору: *«… приглашён …, но Telegram у сотрудника не привязан.»*

**Порядок обработки текста** (дополнение): после pending comment details — **pending mention details**, затем task selection.

### Передача задачи (transfer)

**Slash:** `/transfer Проверить склад | Вася | потому что он отвечает за склад` (разделители `|`, `—`, `-`). Без комментария в slash — уточняющий вопрос *«Почему передаём задачу «…»?»*.

**AI:** «Передай задачу Проверить склад Васе, потому что …» → preview с кнопками (или `да`).

**Роли:**

| Инициатор | После «да» |
|-----------|------------|
| OWNER / MANAGER | `assigneeId` сразу, уведомление новому исполнителю |
| EMPLOYEE / ACCOUNTANT | `PENDING`, новому исполнителю «Принять? да/нет»; без Telegram у получателя — передача не создаётся |

**Принятие / отказ:** pending `pending_task_transfer_decision` у получателя. «да» → `POST /task-transfers/:id/accept`. «нет» → вопрос о причине → `POST .../reject`.

**Права:** постановщик, текущий исполнитель, OWNER, MANAGER.

**Selection:** `select_task_for_transfer`, payload `toUserId`, `toUserName`, `transferComment?`.

**Порядок текста:** после mention details — transfer comment → transfer rejection reason → transfer decision → selection.

### Переназначение задачи (reassign, OWNER/MANAGER)

**Slash:** `/reassign Проверить склад | Вася | Маша | из-за больничного` (2 части: задача и новый исполнитель; 3+: старый и новый). Разделители `|`, `—`, `-`.

**AI:** «Перекинь задачу Проверить склад с Васи на Машу» → preview с полями *Было / Стало* (кнопки или `да`) → `POST /tasks/:id/transfers` (сразу `ACCEPTED`, без согласия нового исполнителя).

**Права:** только **OWNER** / **MANAGER**. Иначе: *«Только руководитель или менеджер может менять задачи сотрудников.»*

**fromUserHint:** если указан («с Васи»), задачи фильтруются по `assigneeId`; при несовпадении с фактическим исполнителем — ошибка без confirmation.

**Уведомления:** новому исполнителю, старому (если другой), постановщику (если не инициатор); без дубля на один `telegramId`.

**Selection:** `select_user_for_reassign_from`, `select_user_for_reassign_to`, `select_task_for_reassign` (payload: `fromUserId?`, `toUserId`, `reassignComment?`).

**Edit на confirmation:** `задача:`, `с кого:`, `старый исполнитель:`, `кому:`, `исполнитель:`, `комментарий:`.

### Взятие задачи в работу (start_task)

**Slash:** `/start-task <название>` или `/work <название>` → preview *«Взять задачу «…» в работу?»* (кнопки или `да`) → `PATCH` `IN_PROGRESS`, ответ *«Задача взята в работу: …»*.

**AI:** «Взял задачу Проверить склад в работу», … → intent `start_task` → тот же preview с кнопками.

**Статусы:** уже `IN_PROGRESS` → *«Задача уже в работе: …»*; `DONE` / `CANCELLED` — соответствующие сообщения; повтор без дубля уведомления постановщику (лог `TASK_STARTED_CREATOR`).

**Права:** исполнитель, постановщик, `OWNER`, `MANAGER`. Иначе: *«Вы не можете изменить эту задачу.»*

**Уведомление постановщику** (если `telegramId` и не он сам): *«{ФИО} взял задачу «{title}» в работу.»*

**Task Selection:** `select_task_for_start` при нескольких задачах с одним названием.

Модуль: `task-start-flow.ts`.

### Закрытие и отмена задач

**Двухшаговый сценарий:** если результат (`completionResult`) или причина (`cancellationReason`) не указаны, бот сначала спрашивает уточнение, затем показывает preview с кнопками (или да/нет текстом). Права проверяются **до** уточняющего вопроса.

**Slash:**

| Команда | Пример |
|---------|--------|
| `/done` | `/done Проверить склад` → *«Что сделано по задаче…?»* |
| `/done` с результатом | `/done Проверить склад — всё проверил` (разделитель `—`, `-` или `:`) → preview |
| `/cancel` | `/cancel Проверить склад` → *«Почему отменяем…?»* |
| `/cancel` с причиной | `/cancel Проверить склад — склад закрыт` → preview |

**AI:**

| Текст | Поведение |
|-------|-----------|
| Закрой задачу Проверить склад | вопрос о результате → preview → `DONE` |
| Закрой задачу Проверить склад, всё проверил | сразу preview с `completionResult` |
| Отмени задачу Проверить склад | вопрос о причине → preview → `CANCELLED` |
| Отмени задачу Проверить склад, склад закрыт | сразу preview с `cancellationReason` |

**Pending details** (в памяти, TTL 30 мин): `pending-task-status-details.ts`. Отмена уточнения: *отмена*, *отмени*, *нет*, *стоп* → *«Ок, действие отменено.»*

**Порядок обработки** (`main.ts`):

- **`callback_query:data`** — `handleChoiceCallback` → `handleConfirmationCallback` (inline-кнопки; не вызывает LLM).
- **`message:text`** (без `/`) — `handlePlainTextMessage` → `ai-message.ts`:

1. Pending confirmation edit — **не** в YandexGPT
2. Pending expense receipt upload / selection (чек к выбранному расходу)
3. Pending confirmation (кнопки или текст: да / нет / изменить; для `create_expense` «нет» → выбор бюджета)
4. Pending budget selection
5. Pending task status / comment / mention / transfer details и decision
6. Pending absence delegation / absence selection
7. Pending task selection, create-task assignee, user selection
8. Проверка привязки (`requireLinkedUser`)
9. **Детерминированный блок** (см. ниже) — **не** в YandexGPT
10. **LLM** (`parseTextIntent` → `AiProvider`) — classifier (опционально) + extractor
11. `routeParsedAiIntent` → resolver → preview (кнопки) → API

Подробнее про AI: [ai-intent.md](ai-intent.md#архитектура-разбора-текста).

### Поиск сотрудника (User Resolution Flow v1)

Модуль: `resolve-users-by-hint.ts`, выбор: `pending-user-selection.ts`.

**Подсказки (hint):** нормализация (trim, lower, `ё`→`е`, без `@`), совпадение по ФИО, имени, фамилии, `telegramUsername`, полю **`systemAliases`** (строка через запятую в БД; генерируется из ФИО при сиде, обновление: `pnpm users:aliases:backfill`), уменьшительным формам из `name_aliases.json` (Ваня, Ване, Ваньку → Иван и т.д.).

**Себя / местоимения:** «мне», «меня», «себе», «на меня», `__self__` от AI → текущий привязанный пользователь.

**Несколько совпадений:** список с номером (TTL 30 мин):

```
Кого вы имели в виду?

1. Иван Иванов · OWNER · @demo_ivan
2. Иван Петров · EMPLOYEE · @ivan_petrov

Напишите номер сотрудника или выберите кнопку ниже.
```

Отмена: кнопка **Отменить** или *отмена*, *отмени*, *нет*, *стоп* → *«Ок, действие отменено.»*

**Не найден:** *«Не нашёл сотрудника «{hint}». Проверьте имя.»*

**Где используется:** `create_task` (assignee после уточнения или из `assigneeHint`), `transfer_task`, `reassign_task`, `mention_in_task`, `create_absence`, slash `/transfer`, `/reassign`, `/mention`, `/link` (dev).

**create_task — исполнитель в AI** (`route-parsed-intent.ts`, `create-task-assignee-resolve.ts`):

- Модель может вернуть `assigneeHint` и/или `assigneeUserId` (в т.ч. `"__self__"` для «мне / себе / создай мне задачу»).
- Перед проверкой обязательных полей `__self__` в hint или `assigneeUserId` **резолвится** в `id` привязанного пользователя; уточняющий вопрос **не** задаётся.
- Вопрос «Кому назначить задачу?» — только если **нет** ни hint, ни `assigneeUserId`, ни `__self__` (TTL 30 мин, `pending-create-task-assignee.ts`):

```
Кому назначить задачу «Уволить Машу»?

Напишите имя сотрудника или «мне».
```

Ответ «мне», «себе», «на меня», «меня» или `__self__` → исполнитель = привязанный пользователь. Имя → User Resolution Flow. Ответ только цифрой без списка → *«Напишите имя сотрудника или «мне».»* Отмена: *отмена*, *отмени*, *нет*, *стоп* → *«Ок, действие отменено.»*

Dev-лог (без секретов): `[bot] create_task assignee before required-fields` с `originalAssigneeUserId`, `resolvedAssigneeUserId`, `isSelfAssignee`, `currentUserId`.

**Slash с «мне»:** `/transfer Проверить склад | мне | …`, `/mention мне | Проверить склад | …`

**Поиск задачи по названию:** точное совпадение `title` (без учёта регистра), затем `includes`.

**Несколько похожих задач:** если после фильтрации по правам и статусу остаётся больше одной задачи, бот показывает нумерованный список (проект, исполнитель, дедлайн, статус) и ждёт номер (TTL 30 мин). Пример:

> Отмени задачу заключить договор, он уже заключён в рамках предыдущей задачи

→ список из 2 задач «Заключить договор» → кнопка `1` или ответ `1` → preview с сохранённой причиной из AI → подтверждение → отменяется только выбранная задача.

Отмена выбора: кнопка **Отменить** или *отмена*, *отмени*, *нет*, *стоп* → *«Ок, действие отменено.»*

**Права (MVP):** исполнитель или постановщик; `OWNER` / `MANAGER` — любая задача.

**Уведомление постановщику** (если есть `telegramId` и он не исполнитель действия):

- DONE: *«{ФИО} закрыл задачу «{title}».»* + строка *Результат: …* при наличии
- CANCELLED: *«{ФИО} отменил задачу «{title}».»* + *Причина отмены: …*

`PATCH /tasks/:id/status` принимает `completionResult` / `cancellationReason`. Повторный `/done` на закрытой задаче — без дубля уведомления.

### Привязка Telegram (username flow)

Руководитель в Web (`/employees`) создаёт сотрудника и указывает **Telegram username** (`@Vasya` → `vasya` на API). Сотрудник в Telegram отправляет **`/start`**.

**Идентификация:**

| Поле | Когда используется |
|------|-------------------|
| `telegramUsername` | Только **первичная привязка** через `/start` (пока `telegramId` пустой) |
| `telegramId` | **Постоянная** идентификация для slash-команд, AI и расходов после подтверждения |

Смена `@username` в Telegram **не отвязывает** сотрудника — связь держится на `telegramId`.

**Отвязка в Web:** `DELETE /users/:id/telegram` — очищает `telegramId` и `telegramUsername`; в Telegram уходит *«Вас открепили от проекта «…»»*. После этого рабочие команды бота недоступны до повторной привязки.

**Поток `/start`:**

1. `GET /users/by-telegram/:telegramId` — если пользователь уже привязан → *«Здравствуйте, {fullName}. Вы уже привязаны.»*
2. Иначе, если у отправителя есть `ctx.from.username`:
   - `GET /users/by-telegram-username/:username` (без `@`, case-insensitive)
   - Найден, `telegramId` пустой → pending `confirm_link_by_username`, вопрос *да / нет*
   - Найден, `telegramId` уже задан → *«…уже привязан. Обратитесь к руководителю.»*
3. Username не указан в Telegram или сотрудник не найден → *«Попросите руководителя добавить ваш username…»*

**Подтверждение:** ответ `да` / `нет` **только текстом** (без общего confirmation-keyboard) → `PATCH /users/:id/telegram` с `telegramId = String(ctx.from.id)` → *«Готово. Telegram привязан…»*; `нет` → *«Привязка отменена.»*

Pending привязки и AI intent хранятся **в памяти** (`pending-intent.ts`), типы различаются полем `type`.

После привязки рабочие действия требуют **linked user** по `telegramId` (`requireLinkedUser`). Без привязки: *«Вы не привязаны ни к какому проекту.»* — fallback на демо-пользователя **отключён**.

### Dev fallback: `/link <ФИО>`

Для локальной отладки без username в Web: поиск сотрудника по подстроке `fullName` (case-insensitive), затем `PATCH /users/:id/telegram`. Не использовать в проде — позже заменится на invite-code.

### Детерминированный разбор (без YandexGPT)

Если фраза совпала с локальным парсером, бот строит тот же `AiIntent`, что и YandexGPT, и передаёт в `routeParsedAiIntent` (resolver → preview с кнопками). GPT **не вызывается**.

| Модуль | Примеры фраз | Результат |
|--------|--------------|-----------|
| `parseTaskListQuery` | «покажи мои задачи», «какие задачи у Васи» | `GET /tasks/my` (без confirmation) |
| `parsePendingExpensesQuery` | «расходы без чеков», «чеки к расходам» | flow `/pending-expenses` |
| `parseExpenseQuery` | «потратил 1500 на рекламу» | `create_expense` → preview |
| `parseCreateBudgetCommand` | «создай бюджет Реклама 50000 с чеком» | `create_budget` → preview |
| `finalizeBasicCreateTask` / `parseBasicCreateTask` | «создай задачу проверить склад» | `create_task` → preview |
| `create-task-assignee-extract` | «создай задачу **Маше** поехать к поставщику» | `assigneeHint` из дательного падежа в начале |
| `parseTaskReassignQuery` | «перекинь задачу с Васи на Машу» | `reassign_task` (OWNER/MANAGER) |
| `parseTaskTransferLikeQuery` | «передай задачу … Васе» | `transfer_task` |

Каталог шаблонов: `apps/bot/src/ai/deterministic/`. Сопоставление бюджета по расходу: `budget-resolver.ts` + `matchingKeywords` из Web.

**Edit-mode для бюджета:** в confirmation `create_budget` поле «чек» можно править фразами «чек да» / «нужен чек» (`parse-budget-receipt-edit.ts`).

### Обычный текст (LLM)

Сообщения **без** `/`, которые **не** разобрал детерминированный слой, обрабатываются `parseTextIntent` (если настроен `AI_PROVIDER`). Двухэтапный поток: classifier → extractor — см. [ai-intent.md](ai-intent.md#двухэтапный-разбор-classifier--extractor).

**Поток после GPT:**

1. `fixAiIntentBeforeValidation` + Zod; `confidence < 0.7` или `intent: unknown` → «Не понял команду…».
2. `validateIntentForRouting` (для `add_task_comment` — recovery текста комментария).
3. Сопоставление hints (`intent-resolver.ts`, `budget-resolver.ts`).
4. Preview с inline-кнопками **Подтвердить / Изменить / Отменить** (или текст: *«Выберите действие кнопками ниже или ответьте текстом: да / изменить / отмена»*).
5. Подтверждение (кнопка или `да`) → `intent-executor.ts` (те же REST-обёртки, что slash).
6. «Нет» / **Отменить** → для `create_expense` выбор другого бюджета; для остальных intent — отмена.
7. **Изменить** (кнопка или текст) → `pending-confirmation-edit.ts` (TTL 30 мин): меню полей кнопками или `поле: значение`. Для `create_budget` — в т.ч. «чек да/нет».

**Пример правки (create_task):**

| Шаг | Сообщение |
|-----|-----------|
| Пользователь | создай задачу подписать договор с ССК |
| Бот | Создать задачу? … + кнопки Подтвердить / Изменить / Отменить |
| Пользователь | Изменить (кнопка) или `изменить` |
| Бот | Что изменить? … (кнопки полей или `задача: …`) |
| Пользователь | Название задачи (кнопка) → `задача: Подписать договор с ССК` |
| Бот | Создать задачу? … + кнопки |
| Пользователь | Подтвердить (кнопка) или `да` | → `POST /tasks` |

**Примеры фраз:**

| Текст | Intent |
|-------|--------|
| Поставь Васе задачу подготовить отчет до 23 мая | `create_task` |
| Запиши заметку: клиент попросил завтра проверить статистику VK | `create_note` |
| Потратил 1500 рублей на рекламу VK | `create_expense` |
| Создай бюджет Реклама 50000, чеки обязательны | `create_budget` |
| Вася заболел до 25 мая, больничный 123456 | `create_absence` |
| удали мой больничный | `cancel_absence` |
| отмени отпуск Васи | `cancel_absence` |
| Взял задачу Проверить склад в работу | `start_task` |
| Беру в работу задачу Заключить договор | `start_task` |
| Закрой задачу Проверить склад | `complete_task` |
| Задача Проверить склад выполнена | `complete_task` |
| Отмени задачу Проверить склад | `cancel_task` |

**Даты в тексте заметок:** в `payload.text` модель может вернуть ISO; бот перед сохранением заменяет `2026-05-22` → `22.05.2026` (`replaceIsoDatesInText`). Поля `deadlineDate` / `startDate` / `endDate` в JSON остаются ISO `YYYY-MM-DD`.

**Сопоставление hints** (`hint-matchers.ts`):

- `projectHint` → проект по подстроке имени (без учёта регистра), иначе проект по умолчанию.
- `assigneeHint` / `userHint` → пользователь по `fullName`, `systemAliases`, уменьшительным формам (`resolve-users-by-hint.ts`).
- `budgetHint` → сопоставление с названием бюджета и полем `matchingKeywords` (Web); при неуверенном совпадении — выбор из списка, без угадывания по товару.
- `taskTitle` → точное совпадение `title` (без учёта регистра), иначе `includes`; несколько совпадений → просьба уточнить.

Pending confirmation хранится **в памяти** процесса (`pending-intent.ts`), как «последний расход».

### Проект и бюджет по умолчанию

Логика в `apps/bot/src/api.ts`:

1. **Проект:** из `GET /projects` предпочитается **«Реклама VK»**, иначе первый в списке.
2. **Бюджет:** из `GET /budgets?projectId=…&status=ACTIVE&userId=…` (фильтр доступа) предпочитается заголовок с «Реклама VK», иначе первый.
3. **Автор / расход / отсутствие:** только пользователь, привязанный по `telegramId` (`requireLinkedUser`).
4. **Исполнитель задачи (AI):** `assigneeHint` / `assigneeUserId` / `__self__` → резолв в `create-task-assignee-resolve.ts`; уточнение только при полном отсутствии исполнителя (см. выше). Slash `/task` — `pickAssigneeId` (Вася или первый `EMPLOYEE`).

Если проектов или бюджетов нет — бот просит создать их в Web.

### Подтверждение расхода (`create_expense`)

После preview «Создать расход?»:

| Ответ | Действие |
|-------|----------|
| **да** | Создать расход |
| **нет** | Выбрать **другой бюджет** из списка (не отмена) |
| **изменить** | Режим правки полей |
| **отмена** / **отмени** / **стоп** / **не добавлять** | Отменить расход |

Для остальных intent (**create_task**, **transfer_task**, …) ответ **нет** по-прежнему **отменяет** действие.

Ключевые слова бюджета задаются в Web (`matchingKeywords`, через запятую) и используются resolver’ом вместо захардкоженных категорий.

### Чеки к расходу и подтверждение

1. Пользователь отправляет `/expense 1500 реклама VK` (или AI `create_expense`).
2. API проверяет: бюджет `ACTIVE`, доступ (OWNER/MANAGER или `BudgetAccess`).
3. Если `requiresReceipt` и чека нет — расход `PENDING_RECEIPT`, ответ: «Расход добавлен как неподтверждённый…».
4. Иначе — `APPROVED` как раньше; чек можно прикрепить опционально.
5. Следующее **фото** или **документ** → `POST /budget-expenses/:expenseId/attachments`; для `PENDING_RECEIPT` статус → `APPROVED`, ответ: «Чек прикреплён. Расход подтверждён.»

### Неподтверждённые расходы (чеки позже)

**Slash:** `/pending-expenses` — список своих расходов `PENDING_RECEIPT` (`GET /budget-expenses/pending`).

**Детерминированный текст** (до YandexGPT): «мои неподтвержденные расходы», «покажи расходы без чеков», «какие чеки я должен загрузить», «что у меня без чеков», «чеки к расходам» и др. (`parse-pending-expenses-query.ts`).

**AI:** `list_pending_expenses`, `payload: {}`, `requiresConfirmation: false`.

**Flow:**

1. Бот показывает нумерованный список (сумма, описание, бюджет, проект, дата) с inline-кнопками.
2. Пользователь выбирает кнопкой, пишет номер или «отмена».
3. Бот просит фото/документ чека.
4. После файла — `attachTelegramReceiptToExpense` → «Чек прикреплён. Расход подтверждён.»

Pending-состояния (TTL 30 мин): выбор расхода → ожидание файла. Приоритет обработки фото: чек к только что созданному расходу → чек к выбранному из списка → чек к последнему расходу.

Архивный бюджет / нет доступа — сообщения из API на русском.

Открытие чека в браузере: через API `GET /budget-expense-attachments/:id/preview`.

### Больничный и отпуск

Обработчики зарегистрированы через **`bot.command("sick")` / `bot.command("vacation")`**, а не `bot.hears`: в grammY сообщения-команды (`/sick …`) по умолчанию **не попадают** в `hears`.

Даты в формате **DD.MM.YYYY** (`apps/bot/src/parse-ru-date.ts` → ISO `YYYY-MM-DD`, например `25.05.2026` → `2026-05-25`).

После `POST /absences` вызывается **`handleAbsenceImpact`** (`apps/bot/src/absence-impact-flow.ts`): уведомления сотруднику и постановщикам, опциональная передача задач через Task Transfer Flow.

`createAbsenceWithImpact()` → `POST /absences` → при непустых `affectedTasks` — Telegram + `POST /absences/:id/notifications`.

**Dev-логи** (консоль бота, без токенов): payload команды, выбранный пользователь, тело POST, при ошибке — `status` и body. Отключить: `BOT_DEV_LOG=0`.

| Команда | Примеры | Логика |
|---------|---------|--------|
| `/sick` | `/sick до 25.05.2026 номер 123456`, `/sick 25.05.2026` | `startDate` = сегодня (UTC), `endDate` из команды, `type` = `SICK_LEAVE`, `status` = `APPROVED` |
| `/vacation` | `/vacation с 01.06.2026 по 10.06.2026`, `/vacation 01.06.2026 10.06.2026` | обе даты из команды, `type` = `VACATION` |

Ответы бота:

- больничный: «Больничный добавлен: с … по …. Номер: …»
- отпуск: «Отпуск добавлен: с … по ….»

При неверной дате — подсказка по использованию команды.

Отображение в Web: вкладка **Отсутствия** проекта (`GET /absences?projectId=…`).

### Отмена больничного / отпуска

AI intent `cancel_absence`, slash `/cancel-absence` (алиас `/delete-absence`).

1. Поиск отсутствия: `GET /absences?userId=…` (без `CANCELLED`), опционально фильтр `type` из AI.
2. Сортировка: текущее (сегодня в периоде) → ближайшее будущее → прошлые по `startDate` desc.
3. 0 записей — «Не нашёл активный больничный или отпуск…»; несколько — **Absence Selection Flow** (`select_absence_for_cancel`, номер из списка).
4. Preview: «Удалить больничный/отпуск … с … по …?» → кнопки или `да` / `нет`.
5. `POST /absences/:id/cancel` с `cancelledById` = привязанный пользователь, `cancellationReason` из AI (опционально).

**Права:** OWNER/MANAGER — любое отсутствие; сотрудник — только своё. Иначе: «Вы не можете удалить это отсутствие.»

**Pending order** (текстовые сообщения): confirmation edit → confirmation → absence selection → absence delegation → task selection → …

Файлы: `absence-cancel-flow.ts`, `absence-cancel-slash-flow.ts`, `pending-absence-selection.ts`, `handle-pending-absence-selection.ts`, `fix-ai-intent-cancel-absence-user.ts`.

### Дедлайн задачи

#### Slash `/deadline`

`bot.command("deadline")` — последняя дата **DD.MM.YYYY** в аргументе, всё до неё — точное название задачи.

| Пример | Действие |
|--------|----------|
| `/deadline Подготовить отчет 22.05.2026` | `GET /tasks?projectId=…` → поиск по `title` → preview → `PATCH /tasks/:id/deadline` |

Ответ: «Дедлайн задачи «…» установлен на …». Ошибки: задача не найдена; несколько совпадений → task selection (кнопки или номер).

#### Даты в `create_task` (AI и deterministic)

Детерминированный парсер в `apps/bot/src/parse-ru-date.ts` **приоритетен** перед LLM:

| Формат | Примеры |
|--------|---------|
| Ordinal + weekday + следующий месяц | «первая пятница следующего месяца» |
| Ordinal + weekday + named month | «первая пятница июля» |
| Календарные | `DD.MM.YYYY`, `DD.MM`, ISO `YYYY-MM-DD` |
| Относительные | завтра, сегодня, послезавтра, «до пятницы», «следующий месяц», … |

**Примеры** (baseDate = `2026-05-25`):

- «первая пятница следующего месяца» → `2026-06-05`
- «первая пятница июля» → `2026-07-03`
- named month: текущий год, если итоговая дата не в прошлом; иначе следующий год

**Postprocess** (`ai/postprocess/create-task-normalize.ts`, `fix-ai-intent-deadline.ts`):

1. `deterministic-deadline-resolver` — `resolveDeadlineFromUserMessage` / `extractDeadlineFromRussianText`
2. `llm-deadline-resolver` — только если `needsLlmDeadlineResolution` (отдельный prompt `create-task-deadline`)
3. `ai-deadline-fallback` — coerce `deadlineDate` из ответа модели, коррекция «следующий месяц», сканирование title+description

После resolve — **cleanup** title/description: удаление использованной временной фразы (named month, «до пятницы» и т.д.) в `create-task-text-cleanup.ts`. Dev-лог (без секретов): `source`, `matchedText`, `aiDeadlineDate`, `resolvedDeadlineDate`, `baseDate`.

Сценарии self-assignee (`__self__`) и missing assignee **не менялись**. Provider layer (YandexGPT / Qwen / registry / `requestAiJson`) **не менялся**.

**Проверка:**

```bash
pnpm --filter @neportal/bot build
pnpm --filter @neportal/bot test
```

`BOT_DEV_SELF_CHECKS=true` — ordinal/named-month/create_task cases при старте; для normalize без API: `BOT_DEV_MOCK_DEADLINE_LLM=true` (см. [env.md](env.md)).

### Absence Impact Flow v1

После `/sick`, `/vacation` или AI `create_absence` (после «да»), если есть affected tasks:

1. Отсутствующему — список задач (title, проект, дедлайн, статус): «оставить / распределить».
2. Постановщикам с `telegramId` — предупреждение по каждой задаче.
3. **Распределить** — по каждой задаче: «мне» / «оставить» или имя сотрудника (User Resolution, `select_user_for_absence_delegation_item` при неоднозначности). Разные задачи можно отдать разным людям.
4. Summary confirmation (`confirm_absence_delegation_distribution`) → `POST /tasks/:id/transfers` только для `TRANSFER`, `requestedById` = **absence.userId**, `absenceId` в теле.
5. Передача на себя или «мне» = KEEP (transfer не создаётся). Без `telegramId` у получателя — остаёмся на текущей задаче.
6. Итог: «запросы отправлены» / «переданы» / смешанный вариант по фактическим статусам transfer.
7. После accept — постановщик получает уведомление о новом исполнителе.

Pending (plain text, до AI): `awaiting_absence_delegation_mode` → `awaiting_absence_delegation_item_assignee`.

**Проверка (сид):** 3 affected tasks у Васи; «распределить» → задача 1 → Маша, 2 → «мне», 3 → Петя → «да» → transfers только для 1 и 3.

### Уведомления по задачам (Telegram)

Три типа уведомлений; дубликаты не отправляются благодаря `TaskNotificationLog` в БД.

| Тип | Когда | Кому |
|-----|--------|------|
| Новая задача | Сразу после `POST /tasks` (`/task`, AI `create_task` после «да») | Исполнитель, если есть `telegramId` и `assigneeId ≠ creatorId` |
| Дедлайн завтра | Scheduler в процессе бота | Исполнитель с привязанным Telegram |
| Просрочка | Scheduler: `deadlineAt` в прошлом, статус не DONE/CANCELLED | Исполнитель и постановщик (если у каждого есть `telegramId`) |

**Scheduler** (без отдельного worker): `startTaskNotificationScheduler` в `main.ts` — `setInterval` по умолчанию 60 с.

В **корневом** `.env`:

```env
TASK_NOTIFICATION_SCHEDULER_ENABLED=true
TASK_NOTIFICATION_INTERVAL_MS=60000
```

Для теста дедлайна/просрочки можно уменьшить интервал (например `10000`).

Граница «завтра» считается в **локальном времени сервера** (API: `GET /tasks/notifications/deadline-tomorrow`).

**Проверка новой задачи:** от Ивана (привязан Telegram) — фраза *«Создай задачу Васе проверить склад завтра»* → Подтвердить (кнопка) или «да» → Васе приходит *«Вам назначена новая задача…»*.

**Проверка дедлайна завтра:** задача с `deadlineAt` на завтра, у исполнителя есть `telegramId` → одно сообщение *«Завтра дедлайн по задаче…»*; повторно scheduler не шлёт.

**Проверка просрочки:** `deadlineAt` вчера (или через Prisma) → исполнителю и постановщику по одному сообщению; повторно не шлёт.

REST для scheduler (вызывает бот):

- `GET /tasks/notifications/deadline-tomorrow`
- `GET /tasks/notifications/overdue`
- `POST /tasks/:id/notifications` — body `{ userId, type }`, идемпотентный upsert по `(taskId, userId, type)`

## HTTP-клиент бота

Файл `apps/bot/src/api.ts` — обёртки над REST:

- `fetchUsers`, `fetchUserByTelegramId`, `fetchUserByTelegramUsername`, `linkTelegramUser`
- `fetchProjects`, `fetchBudgets`, `fetchTasks`
- `createTask`, `createNote`, `createBudgetExpense` (alias `createExpense`), `createExpenseAttachment`, `createAbsence`
- `updateTaskDeadline` (alias `setTaskDeadline`)
- `updateTaskStatus`
- `fetchDeadlineTomorrowNotifications`, `fetchOverdueNotifications`, `recordTaskNotification`
- `pickAssigneeId`, `pickDefaultProjectId`, `pickDefaultBudget`, `findUserByNameHint`

При ошибке `POST /absences` бот пишет в консоль `status` и body и отвечает пользователю понятным текстом.

## Структура кода (AI и команды)

| Файл | Назначение |
|------|------------|
| `main.ts` | Команды, `callback_query:data`, фото/документов, `message:text` → handlers, `bot.catch` |
| `yandex-gpt.ts` | Оркестрация `parseTextIntent`, `requestAiJson`, classifier/extractor, валидация |
| `ai/provider/types.ts` | Интерфейс `AiProvider`, `AiCompletionParams/Result` |
| `ai/provider/yandex-provider.ts` | HTTP YandexGPT Foundation Models |
| `ai/provider/qwen-provider.ts` | HTTP Qwen (Yandex Cloud AI Studio, OpenAI-compatible) |
| `ai/provider/registry.ts` | `getPrimaryAiProvider()`, `AI_PROVIDER`, `getAiProviderState()` |
| `ai/provider/http.ts` | Timeout, retry/backoff, `requestProviderHttp()` |
| `ai/provider/errors.ts` | `AiProviderError` (безопасные коды для логов) |
| `ai/provider/provider-config.ts` | `AI_PROVIDER_TIMEOUT_MS`, max retries, diagnostics base |
| `ai/completion-max-tokens.ts` | `maxTokens` по `promptGroup` |
| `ai/prompt-group-router.ts` | Предмаршрутизация без classifier |
| `create-task-assignee-resolve.ts` | Резолв `__self__` → текущий user id до clarification |
| `ai-contracts.ts` | Загрузка Zod-схемы из `packages/ai-contracts/dist` (обход stale `node_modules`) |
| `ai-message.ts` | Текст без `/`: pending → deterministic → `parseTextIntent` |
| `route-parsed-intent.ts` | Общий routing после parse (deterministic или GPT) |
| `parse-expense-query.ts` | Детерминированный `create_expense` |
| `parse-create-budget-command.ts` | Детерминированный `create_budget` |
| `budget-resolver.ts` | Выбор бюджета по hint и `matchingKeywords` |
| `create-task-assignee-extract.ts` | Исполнитель из «создай задачу Маше …» |
| `validate-add-task-comment-payload.ts` | Recovery комментария после LLM |
| `ai/deterministic/*` | Шаблоны create_task, reassign, разделители комментария |
| `intent-context.ts` | Контекст для prompt: дата, проекты, пользователи, бюджеты, задачи |
| `intent-resolver.ts` | hints → ID сущностей |
| `intent-preview.ts` | Текст preview + footer с подсказкой кнопок/текста |
| `intent-executor.ts` | Вызов API после подтверждения |
| `confirmation.ts` | Текстовый fallback: да / нет / изменить / отмена |
| `confirmation-reply.ts` | `replyWithConfirmationPreview` — сообщение + confirmation keyboard |
| `confirmation-callback.ts` | `callback_query` → `applyConfirmationDecision` |
| `confirmation-decision.ts` | Общая логика confirm / edit / cancel |
| `confirmation-edit.ts` | Подсказки и парсинг правок; меню полей через choice |
| `confirmation/editable-fields.ts` | Список полей edit по intent |
| `pending-confirmation-edit.ts` | In-memory режим правки confirmation (TTL 30 мин) |
| `telegram/keyboards/confirmation-keyboard.ts` | Inline: Подтвердить / Изменить / Отменить |
| `telegram/keyboards/choice-keyboard.ts` | Inline: нумерованные пункты + Отменить |
| `choice-callback.ts` | `callback_query` для choice |
| `choice-state.ts` | Pending choice, применение индекса |
| `choice-reply.ts` | `replyWithActiveChoiceKeyboard` |
| `telegram/safe-answer-callback.ts` | Безопасный `answerCallbackQuery` |
| `telegram/safe-edit-message-reply-markup.ts` | Снятие клавиатуры без падения middleware |
| `telegram/callback-log.ts` | Контекст логов callback без секретов |
| `telegram-error-log.ts` | `bot.catch` — глобальные ошибки middleware |
| `pending-intent.ts` | In-memory pending: AI intent или привязка по username |
| `send-telegram.ts` | `sendTelegramMessage` — обёртка над `bot.api.sendMessage` |
| `task-notifications.ts` | Тексты и `notifyTaskAssigned` после создания задачи |
| `task-notification-scheduler.ts` | Периодический опрос API: дедлайн завтра, просрочка |
| `task-start-flow.ts` | `/start-task`, `/work`, AI `start_task`: поиск, права, confirmation, PATCH `IN_PROGRESS` |
| `task-status-flow.ts` | `/done`, `/cancel`: поиск, права, confirmation, PATCH status |
| `resolve-task-by-title.ts` | Общий поиск задачи + запуск selection flow |
| `pending-task-selection.ts` | Ожидание номера задачи (TTL 30 мин) |
| `task-selection-format.ts` | Формат списка кандидатов |
| `handle-pending-task-selection.ts` | Выбор (кнопка или номер) → details или preview |
| `pending-create-task-assignee.ts` | Ожидание исполнителя для create_task (TTL 30 мин) |
| `create-task-assignee-flow.ts` | Текст вопроса и confirmation после выбора исполнителя |
| `handle-pending-create-task-assignee.ts` | Ответ «мне» / имя → preview или User Selection |
| `handle-task-intent.ts` | AI complete/cancel/deadline с selection |
| `handle-deadline-slash.ts` | `/deadline` с selection и confirmation |
| `pending-task-status-details.ts` | Ожидание результата/причины (TTL 30 мин) |
| `handle-pending-task-status-details.ts` | Ответ на уточняющий вопрос → preview |
| `task-comment-flow.ts` | Комментарий: slash, lookup, execute, notify |
| `pending-task-comment-details.ts` | Ожидание текста комментария (TTL 30 мин) |
| `handle-pending-task-comment-details.ts` | Ответ на вопрос о тексте → preview |
| `handle-task-comment-intent.ts` | AI `add_task_comment` с selection |
| `handle-mention-intent.ts` | AI `mention_in_task` с selection |
| `task-mention-flow.ts` | slash `/mention`, execute mention |
| `pending-task-mention-details.ts` | ожидание текста призыва |
| `start-binding.ts` | Логика `/start` и подтверждение привязки |
| `current-user.ts` | Linked user или fallback для slash/AI |
| `parse-ru-date.ts` | DD.MM.YYYY ↔ ISO, ordinal/named-month дедлайны, `resolveDeadlineFromUserMessage`, `replaceIsoDatesInText` |
| `ai/postprocess/create-task-normalize.ts` | Дедлайн create_task: deterministic → LLM fallback → cleanup title |
| `ai/postprocess/create-task-deadline-llm.ts` | `needsLlmDeadlineResolution`, LLM/mock дедлайна |
| `ai/postprocess/create-task-text-cleanup.ts` | Удаление временных фраз из title/description |
| `fix-ai-intent-deadline.ts` | Дедлайн до Zod-валидации |

**Dev-логи AI** (не логируют токены; отключить: `BOT_DEV_LOG=0`):

- `[yandex-gpt] tokens provider=… promptGroup=… latencyMs=…`
- `raw AI JSON before validation`, `validation error`, `parsed intent`
- `create_task assignee before required-fields` (резолв `__self__`)
- `BOT_DEV_SELF_CHECKS=true` — self-checks при старте (registry, assignee, парсеры, confirmation/choice keyboard, create_task deadline)
- `BOT_DEV_MOCK_DEADLINE_LLM=true` — mock LLM дедлайна в dev-checks normalize (см. [env.md](env.md))

## Troubleshooting

| Симптом | Причина / решение |
|---------|-------------------|
| `/sick` молчит или не создаёт запись | Раньше: `bot.hears` не ловит команды. Сейчас: `bot.command`. Перезапустите `pnpm --filter @neportal/bot dev`. |
| `GET /absences` пустой после `/sick` | Проверьте логи `[bot] POST /absences`, `API_URL` в `.env`, что API запущен на `:4000`. |
| Ошибка 400/404 от API | В логе будет body ответа; проверьте `pnpm db:seed` и `userId`. |
| YandexGPT HTTP 401 `Unknown api key` | IAM-токен передан как `Api-Key`. Используйте `YANDEX_GPT_API_KEY` для `Api-Key`, `YANDEX_CLOUD_IAM_TOKEN` для `Bearer`. |
| Zod: `version` / `action` / `entity` | Устаревший `@neportal/ai-contracts` в `node_modules`. Выполните `pnpm --filter @neportal/ai-contracts build` и перезапустите бота (см. `ai-contracts.ts`). |
| «Не смог разобрать команду» | Невалидный JSON от модели или ошибка схемы; смотрите `[yandex-gpt] validation error`. |
| В заметке дата `2026-05-22` | Перезапустите бота с актуальным кодом (`replaceIsoDatesInText` в `intent-resolver`). |

## Ограничения

- Состояние «последний расход» и **pending AI intent** — **в памяти процесса**; сбрасывается при перезапуске бота.
- LLM **не выполняет** действия — только парсит текст; API вызывает бот после «да».
- Без привязки `telegramId` рабочие команды и AI **не выполняются** (`NOT_LINKED_MESSAGE`). Доступны: `/start`, `/demo`, `/me`, `/link` (dev).
- `/link` — только для dev; в продукте — username в Web + `/start`.
- SpeechKit / голосовые сообщения — не реализованы (env в `.env.example` — заготовка); inline-кнопки снижают ошибки ввода до голоса.
- Уведомления по задачам — in-process scheduler в боте; позже worker/BullMQ.
- Webhook-режим только выставляет URL; HTTP-сервер для приёма апдейтов нужно поднимать отдельно (не в MVP).
- Деплой в Yandex Cloud для MVP **не требуется** — только внешние API Yandex Cloud (Foundation Models / AI Studio) и SpeechKit из локального бота.
