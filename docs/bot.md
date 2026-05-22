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

### YandexGPT (опционально)

Для разбора **обычного текста** без slash-команд в **корневом** `.env`:

```env
YANDEX_CLOUD_FOLDER_ID=<folder-id>
# API key (приоритет): Authorization: Api-Key
YANDEX_GPT_API_KEY=<ключ вида y0__...>
# Или IAM token: Authorization: Bearer (если API key не задан)
YANDEX_CLOUD_IAM_TOKEN=
YANDEX_GPT_MODEL_URI=gpt://<folder-id>/yandexgpt/latest
```

| Переменная | Назначение |
|------------|------------|
| `YANDEX_CLOUD_FOLDER_ID` | Каталог Yandex Cloud, заголовок `x-folder-id` |
| `YANDEX_GPT_API_KEY` | Статический ключ; **не** подставлять в `Bearer` |
| `YANDEX_CLOUD_IAM_TOKEN` | IAM-токен; **не** подставлять в `Api-Key` |
| `YANDEX_GPT_MODEL_URI` | URI модели; если `change_me` — `gpt://{folder}/yandexgpt/latest` |

Значения `change_me` и пустые строки считаются «не задано».

Если Yandex не настроен — slash-команды работают; на произвольный текст бот отвечает: *«AI-парсер пока не настроен. Используйте команды /demo.»*

При успешном старте в консоли (без секретов): `[yandex-gpt] auth mode: api-key` или `iam-token`.

Подробнее о контракте JSON → [ai-intent.md](ai-intent.md).

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
| `/deadline <название> <дата>` | `PATCH /tasks/:id/deadline` |
| `/done <название>` | `PATCH /tasks/:id/status` → `DONE` |
| `/cancel <название>` | `PATCH /tasks/:id/status` → `CANCELLED` |
| `/comment <задача> — <текст>` | `POST /tasks/:id/comments`, source `TELEGRAM_TEXT` |
| `/mention <сотрудник> \| <задача> \| <текст>` | `POST /tasks/:id/comments/mention`, source `TELEGRAM_TEXT` |
| `/transfer <задача> \| <исполнитель> \| <комментарий>` | `POST /tasks/:id/transfers` |

### Комментарии к задачам

**Slash:**

| Команда | Пример |
|---------|--------|
| `/comment` с текстом | `/comment Проверить склад — склад закрыт до завтра` (разделитель `—`, `-` или `:`) → confirmation → `да` |
| `/comment` без текста | `/comment Проверить склад` → *«Что написать в комментарии к задаче «…»?»* → confirmation → `да` |

**AI:**

| Текст | Поведение |
|-------|-----------|
| Напиши комментарий к задаче Проверить склад: склад закрыт | confirmation с `text` |
| Напиши комментарий к задаче Проверить склад | вопрос о тексте → confirmation |

**Pending comment details** (TTL 30 мин): `pending-task-comment-details.ts`. Отмена: *отмена*, *отмени*, *нет*, *стоп*.

**Selection:** тип `select_task_for_comment`; если `commentText` уже в payload — после выбора номера сразу confirmation, иначе — уточняющий вопрос.

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
| `/mention` | `/mention Вася \| Проверить склад \| нужны его комментарии` → confirmation → `да` |
| `/mention` без текста | не поддерживается в slash (нужны три части) |

**AI:**

| Текст | Поведение |
|-------|-----------|
| Позови Васю в задачу Проверить склад, нужны его комментарии | поиск сотрудника + задачи → confirmation |
| Попроси Петра прокомментировать задачу Реклама VK | вопрос о тексте → confirmation |

**Pending mention details** (TTL 30 мин): `pending-task-mention-details.ts`, тип `awaiting_task_mention_text`. Отмена: *отмена*, *отмени*, *нет*, *стоп*.

**Selection:** тип `select_task_for_mention`; payload: `mentionedUserId`, `mentionedUserName`, `mentionText?`. После выбора номера — confirmation или вопрос о тексте.

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

**AI:** «Передай задачу Проверить склад Васе, потому что …» → confirmation → `да`.

**Роли:**

| Инициатор | После «да» |
|-----------|------------|
| OWNER / MANAGER | `assigneeId` сразу, уведомление новому исполнителю |
| EMPLOYEE / ACCOUNTANT | `PENDING`, новому исполнителю «Принять? да/нет»; без Telegram у получателя — передача не создаётся |

**Принятие / отказ:** pending `pending_task_transfer_decision` у получателя. «да» → `POST /task-transfers/:id/accept`. «нет» → вопрос о причине → `POST .../reject`.

**Права:** постановщик, текущий исполнитель, OWNER, MANAGER.

**Selection:** `select_task_for_transfer`, payload `toUserId`, `toUserName`, `transferComment?`.

**Порядок текста:** после mention details — transfer comment → transfer rejection reason → transfer decision → selection.

### Закрытие и отмена задач

**Двухшаговый сценарий:** если результат (`completionResult`) или причина (`cancellationReason`) не указаны, бот сначала спрашивает уточнение, затем показывает confirmation (да/нет). Права проверяются **до** уточняющего вопроса.

**Slash:**

| Команда | Пример |
|---------|--------|
| `/done` | `/done Проверить склад` → *«Что сделано по задаче…?»* |
| `/done` с результатом | `/done Проверить склад — всё проверил` (разделитель `—`, `-` или `:`) → confirmation |
| `/cancel` | `/cancel Проверить склад` → *«Почему отменяем…?»* |
| `/cancel` с причиной | `/cancel Проверить склад — склад закрыт` → confirmation |

**AI:**

| Текст | Поведение |
|-------|-----------|
| Закрой задачу Проверить склад | вопрос о результате → confirmation → `DONE` |
| Закрой задачу Проверить склад, всё проверил | сразу confirmation с `completionResult` |
| Отмени задачу Проверить склад | вопрос о причине → confirmation → `CANCELLED` |
| Отмени задачу Проверить склад, склад закрыт | сразу confirmation с `cancellationReason` |

**Pending details** (в памяти, TTL 30 мин): `pending-task-status-details.ts`. Отмена уточнения: *отмена*, *отмени*, *нет*, *стоп* → *«Ок, действие отменено.»*

**Порядок обработки обычного текста** (`ai-message.ts`):

1. Pending confirmation (да/нет)
2. Pending details (результат/причина) — **не** отправляется в YandexGPT
3. Pending comment details (текст комментария) — **не** отправляется в YandexGPT
4. Pending mention details (текст призыва) — **не** отправляется в YandexGPT
5. Pending transfer comment — **не** отправляется в YandexGPT
6. Pending transfer rejection reason — **не** отправляется в YandexGPT
7. Pending transfer decision (да/нет у получателя) — **не** отправляется в YandexGPT
8. Pending task selection (номер задачи) — **не** отправляется в YandexGPT
9. Иначе AI parser (slash-команды обрабатываются grammY до `message:text`)

**Поиск задачи по названию:** точное совпадение `title` (без учёта регистра), затем `includes`.

**Несколько похожих задач:** если после фильтрации по правам и статусу остаётся больше одной задачи, бот показывает нумерованный список (проект, исполнитель, дедлайн, статус) и ждёт номер (TTL 30 мин). Пример:

> Отмени задачу заключить договор, он уже заключён в рамках предыдущей задачи

→ список из 2 задач «Заключить договор» → ответ `1` → confirmation с сохранённой причиной из AI → `да` → отменяется только выбранная задача.

Отмена выбора: *отмена*, *отмени*, *нет*, *стоп* → *«Ок, действие отменено.»*

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

**Подтверждение:** ответ `да` → `PATCH /users/:id/telegram` с `telegramId = String(ctx.from.id)` → *«Готово. Telegram привязан…»*; `нет` → *«Привязка отменена.»*

Pending привязки и AI intent хранятся **в памяти** (`pending-intent.ts`), типы различаются полем `type`.

После привязки рабочие действия требуют **linked user** по `telegramId` (`requireLinkedUser`). Без привязки: *«Вы не привязаны ни к какому проекту.»* — fallback на демо-пользователя **отключён**.

### Dev fallback: `/link <ФИО>`

Для локальной отладки без username в Web: поиск сотрудника по подстроке `fullName` (case-insensitive), затем `PATCH /users/:id/telegram`. Не использовать в проде — позже заменится на invite-code.

### Обычный текст (YandexGPT)

Сообщения **без** `/` в начале (не команда) обрабатываются AI-парсером, если заданы переменные Yandex.

**Поток:**

1. Текст → YandexGPT → JSON intent (см. `@neportal/ai-contracts`).
2. Валидация Zod; `confidence < 0.7` или `intent: unknown` → «Не понял команду…».
3. Сопоставление hints с проектами/пользователями/бюджетами/задачами из API (`intent-resolver.ts`).
4. Preview и вопрос: *«Ответьте: да / нет»*.
5. Ответ `да` / `+` / `yes` (регистр не важен) → выполнение через те же REST-обёртки, что и slash-команды.
6. `нет` / `-` / `no` → отмена; pending сбрасывается.

**Примеры фраз:**

| Текст | Intent |
|-------|--------|
| Поставь Васе задачу подготовить отчет до 23 мая | `create_task` |
| Запиши заметку: клиент попросил завтра проверить статистику VK | `create_note` |
| Потратил 1500 рублей на рекламу VK | `create_expense` |
| Вася заболел до 25 мая, больничный 123456 | `create_absence` |
| Закрой задачу Проверить склад | `complete_task` |
| Задача Проверить склад выполнена | `complete_task` |
| Отмени задачу Проверить склад | `cancel_task` |

**Даты в тексте заметок:** в `payload.text` модель может вернуть ISO; бот перед сохранением заменяет `2026-05-22` → `22.05.2026` (`replaceIsoDatesInText`). Поля `deadlineDate` / `startDate` / `endDate` в JSON остаются ISO `YYYY-MM-DD`.

**Сопоставление hints** (`hint-matchers.ts`):

- `projectHint` → проект по подстроке имени (без учёта регистра), иначе проект по умолчанию.
- `assigneeHint` / `userHint` → пользователь по подстроке `fullName`.
- `budgetHint` → бюджет проекта по подстроке `title`, иначе первый бюджет.
- `taskTitle` → точное совпадение `title` (без учёта регистра), иначе `includes`; несколько совпадений → просьба уточнить.

Pending confirmation хранится **в памяти** процесса (`pending-intent.ts`), как «последний расход».

### Проект и бюджет по умолчанию

Логика в `apps/bot/src/api.ts`:

1. **Проект:** из `GET /projects` предпочитается **«Реклама VK»**, иначе первый в списке.
2. **Бюджет:** из `GET /budgets?projectId=…` предпочитается заголовок, содержащий «Реклама VK», иначе первый.
3. **Автор / расход / отсутствие:** только пользователь, привязанный по `telegramId` (`requireLinkedUser`).
4. **Исполнитель задачи:** **Вася** (`EMPLOYEE`), иначе первый `EMPLOYEE` (если не указан `assigneeHint` в AI).

Если проектов или бюджетов нет — бот просит создать их в Web.

### Чеки к расходу

1. Пользователь отправляет `/expense 1500 реклама VK`.
2. Бот создаёт расход и сохраняет «последний расход» в памяти (`last-expense.ts`) по `telegram user id`.
3. Следующее **фото** или **документ** → `POST /budget-expenses/:expenseId/attachments` с `telegramFileId`.

Открытие чека в браузере: через API `GET /budget-expense-attachments/:id/preview`.

### Больничный и отпуск

Обработчики зарегистрированы через **`bot.command("sick")` / `bot.command("vacation")`**, а не `bot.hears`: в grammY сообщения-команды (`/sick …`) по умолчанию **не попадают** в `hears`.

Даты в формате **DD.MM.YYYY** (`apps/bot/src/parse-ru-date.ts` → ISO `YYYY-MM-DD`, например `25.05.2026` → `2026-05-25`).

`createAbsence()` делает `POST ${API_URL}/absences` с телом `{ userId, type, startDate, endDate, documentNumber?, status: "APPROVED" }`.

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

### Дедлайн задачи

`bot.command("deadline")` — последняя дата **DD.MM.YYYY** в аргументе, всё до неё — точное название задачи.

| Пример | Действие |
|--------|----------|
| `/deadline Подготовить отчет 22.05.2026` | `GET /tasks?projectId=…` → поиск по `title` → `PATCH /tasks/:id/deadline` |

Ответ: «Дедлайн задачи «…» установлен на …». Ошибки: задача не найдена; несколько совпадений.

Для проверки **affectedTasks**: в сиде есть задача «Подписать договор с подрядчиком» (исполнитель Иван, deadline 22.05.2026) + `/sick до 25.05.2026` для Ивана.

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

**Проверка новой задачи:** от Ивана (привязан Telegram) — фраза *«Создай задачу Васе проверить склад завтра»* → «да» → Васе приходит *«Вам назначена новая задача…»*.

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
| `main.ts` | Регистрация команд, фото/документов, `message:text` → `ai-message.ts` |
| `yandex-gpt.ts` | Запрос в YandexGPT, prompt, auth, `extractJsonText`, валидация |
| `ai-contracts.ts` | Загрузка Zod-схемы из `packages/ai-contracts/dist` (обход stale `node_modules`) |
| `ai-message.ts` | Текст без `/`, confirmation, порог confidence |
| `intent-context.ts` | Контекст для prompt: дата, проекты, пользователи, бюджеты, задачи |
| `intent-resolver.ts` | hints → ID сущностей |
| `intent-preview.ts` | Текст «Создать задачу? … Ответьте: да / нет» |
| `intent-executor.ts` | Вызов API после подтверждения |
| `confirmation.ts` | Распознавание да/нет |
| `pending-intent.ts` | In-memory pending: AI intent или привязка по username |
| `send-telegram.ts` | `sendTelegramMessage` — обёртка над `bot.api.sendMessage` |
| `task-notifications.ts` | Тексты и `notifyTaskAssigned` после создания задачи |
| `task-notification-scheduler.ts` | Периодический опрос API: дедлайн завтра, просрочка |
| `task-status-flow.ts` | `/done`, `/cancel`: поиск, права, confirmation, PATCH status |
| `resolve-task-by-title.ts` | Общий поиск задачи + запуск selection flow |
| `pending-task-selection.ts` | Ожидание номера задачи (TTL 30 мин) |
| `task-selection-format.ts` | Формат списка кандидатов |
| `handle-pending-task-selection.ts` | Выбор по номеру → details или confirmation |
| `handle-task-intent.ts` | AI complete/cancel/deadline с selection |
| `handle-deadline-slash.ts` | `/deadline` с selection и confirmation |
| `pending-task-status-details.ts` | Ожидание результата/причины (TTL 30 мин) |
| `handle-pending-task-status-details.ts` | Ответ на уточняющий вопрос → confirmation |
| `task-comment-flow.ts` | Комментарий: slash, lookup, execute, notify |
| `pending-task-comment-details.ts` | Ожидание текста комментария (TTL 30 мин) |
| `handle-pending-task-comment-details.ts` | Ответ на вопрос о тексте → confirmation |
| `handle-task-comment-intent.ts` | AI `add_task_comment` с selection |
| `handle-mention-intent.ts` | AI `mention_in_task` с selection |
| `task-mention-flow.ts` | slash `/mention`, execute mention |
| `pending-task-mention-details.ts` | ожидание текста призыва |
| `start-binding.ts` | Логика `/start` и подтверждение привязки |
| `current-user.ts` | Linked user или fallback для slash/AI |
| `parse-ru-date.ts` | DD.MM.YYYY ↔ ISO, `replaceIsoDatesInText` |

**Dev-логи YandexGPT** (не логируют токены; отключить: `BOT_DEV_LOG=0`):

- `raw AI JSON before validation`
- `validation error` / `parsed intent`

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
- YandexGPT **не выполняет** действия — только парсит текст; API вызывает бот после «да».
- Без привязки `telegramId` рабочие команды и AI **не выполняются** (`NOT_LINKED_MESSAGE`). Доступны: `/start`, `/demo`, `/me`, `/link` (dev).
- `/link` — только для dev; в продукте — username в Web + `/start`.
- SpeechKit / голосовые сообщения — не реализованы (env в `.env.example` — заготовка).
- Уведомления по задачам — in-process scheduler в боте; позже worker/BullMQ.
- Webhook-режим только выставляет URL; HTTP-сервер для приёма апдейтов нужно поднимать отдельно (не в MVP).
- Деплой в Yandex Cloud для MVP **не требуется** — только внешний API YandexGPT/SpeechKit из локального бота.
