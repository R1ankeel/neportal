# REST API

Базовый URL: `API_URL` (по умолчанию `http://localhost:4000`).

Интерактивная спецификация: **http://localhost:4000/docs** (Swagger UI).

## Общие правила

- Формат: JSON, `Content-Type: application/json`.
- Валидация: `ValidationPipe` (whitelist, лишние поля → 400).
- **Авторизация отсутствует** - подходит только для локальной разработки и демо.
- Все сущности привязаны к организации из `NEPORTAL_ORG_SLUG` / `NEPORTAL_ORGANIZATION_ID`.

## Health

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Проверка живости (`AppService`) |

## Users

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/users` | Список ACTIVE; `?includeArchived=true` - все |
| POST | `/users` | Создать сотрудника (`fullName`, `role`, `telegramUsername?`, …) |
| GET | `/users/by-telegram/:telegramId` | По Telegram id (в org) |
| GET | `/users/by-telegram-username/:username` | По @username без `@`, case-insensitive |
| GET | `/users/:id` | Пользователь по id |
| PATCH | `/users/:id` | Обновить (`telegramUsername` можно сбросить `null`) |
| PATCH | `/users/:id/telegram` | Привязать `telegramId` (unique глобально) |
| DELETE | `/users/:id/telegram` | Полный сброс Telegram; уведомление в Telegram (*«Вас открепили от проекта …»*) |
| DELETE | `/users/:id` | Архивировать (`status=ARCHIVED`, Telegram очищается; последний OWNER запрещён) |

## Projects

| Метод | Путь | Query | Описание |
|-------|------|-------|----------|
| GET | `/projects` | - | Все проекты org |
| POST | `/projects` | - | Создать проект |
| GET | `/projects/:id` | - | Проект с участниками |
| GET | `/projects/:id/summary` | - | Сводка: задачи, бюджеты, счётчики |

**POST /projects** (основные поля): `name`, `createdById`, опционально `description`.

## Tasks

| Метод | Путь | Query | Описание |
|-------|------|-------|----------|
| GET | `/tasks` | `projectId?` | Список задач |
| GET | `/tasks/my` | `userId`, `limit?` (1-20, default 5) | Активные задачи исполнителя по дедлайну |
| GET | `/tasks/:id` | - | Карточка задачи с комментариями |
| POST | `/tasks` | - | Создать задачу |
| GET | `/tasks/:id/comments` | - | Комментарии задачи (по `createdAt` asc) |
| POST | `/tasks/:id/comments` | - | Добавить комментарий |
| POST | `/tasks/:id/comments/mention` | - | Комментарий с призывом сотрудника |
| GET | `/tasks/:id/transfers` | - | История передач задачи |
| POST | `/tasks/:id/transfers` | - | Передать задачу другому исполнителю |
| PATCH | `/tasks/:id/deadline` | - | Установить или сбросить дедлайн |
| PATCH | `/tasks/:id/status` | - | Сменить статус |

**POST /tasks** - тело (`CreateTaskDto`):

```json
{
  "title": "Сделать отчёт",
  "description": "опционально",
  "projectId": "cuid проекта",
  "creatorId": "cuid пользователя",
  "assigneeId": "cuid исполнителя",
  "status": "NEW"
}
```

`projectId` опционален - без него задача «глобальная» в рамках org.

**GET /tasks/my** (`MyTasksQueryDto`):

- `userId` - исполнитель (должен быть в org из контекста).
- `limit` - по умолчанию `5`, максимум `20`.
- Фильтр: `status` ∈ `NEW`, `IN_PROGRESS`; `assigneeId = userId`.
- Сортировка: `deadlineAt` asc (без дедлайна - в конце), затем `createdAt` asc.
- Include: `project { id, name }`, `creator { id, fullName }`, `assignee { id, fullName }`.

**PATCH /tasks/:id/deadline** (`UpdateTaskDeadlineDto`):

```json
{ "deadlineAt": "2026-05-22" }
```

Для date-only время нормализуется до **конца дня UTC** (`23:59:59.999`). `deadlineAt: null` - сброс дедлайна.

**PATCH /tasks/:id/status**:

```json
{ "status": "IN_PROGRESS" }
```

Статусы: `NEW`, `IN_PROGRESS`, `DONE`, `CANCELLED`.

При смене статуса:

| status | Поля |
|--------|------|
| `IN_PROGRESS` | `startedAt` = существующий или `now`; `completedAt`, `cancelledAt`, `completionResult`, `cancellationReason` → `null` |
| `NEW` | `startedAt` → `null`; сброс полей завершения/отмены |
| `DONE` | `completedAt` = `now`; … |
| `CANCELLED` | `cancelledAt` = `now`; … |

Ответ включает `startedAt`, `creator` и `assignee` (с `telegramId`), `project`.

**POST /tasks/:id/notifications** - типы включают `TASK_STARTED_CREATOR` (идемпотентный upsert по `(taskId, userId, type)`).

**GET /tasks/:id** - поля задачи плюс `project`, `creator`, `assignee` (с `role`, `telegramId`), `comments[]` (с `author` и `mentions[]`), `transfers[]` (с `fromUser`, `toUser`, `requestedBy`, `status`, `comment`, `rejectionReason`).

**POST /tasks/:id/comments** (`CreateTaskCommentDto`):

```json
{
  "authorId": "cuid пользователя org",
  "text": "Текст комментария",
  "source": "WEB"
}
```

`source` опционален (`WEB` | `TELEGRAM_TEXT` | `TELEGRAM_VOICE`, по умолчанию `WEB`). `text` обязателен, trim, минимум 1 символ. Задача и автор должны принадлежать текущей организации.

**POST /tasks/:id/comments/mention** (`CreateTaskCommentMentionDto`):

```json
{
  "authorId": "cuid автора",
  "mentionedUserId": "cuid приглашённого",
  "text": "Нужны ваши комментарии",
  "source": "TELEGRAM_TEXT"
}
```

Транзакционно создаёт `TaskComment` и `TaskCommentMention`. Ответ: `{ comment, mention, task, mentionedUser, author }` (task с `project`, `creator`, `assignee`). `mentionedUserId` и `authorId` должны быть в текущей org.

**POST /tasks/:id/transfers** (`CreateTaskTransferDto`):

```json
{
  "requestedById": "cuid инициатора",
  "toUserId": "cuid нового исполнителя",
  "comment": "потому что он отвечает за склад",
  "absenceId": "опционально - передача из Absence Impact Flow"
}
```

Задача в статусе `NEW` или `IN_PROGRESS`. `toUserId` ≠ текущий `assigneeId`. `fromUserId` = `assigneeId` или `requestedById`, если исполнитель не назначен.

- **OWNER / MANAGER:** `TaskTransfer` со статусом `ACCEPTED`, `decidedAt` = now, `task.assigneeId` обновляется сразу.
- **EMPLOYEE / ACCOUNTANT:** `TaskTransfer` со статусом `PENDING`, `assigneeId` не меняется до принятия.

Ответ: `{ transfer, task }`.

**POST /task-transfers/:id/accept** - body `{ userId }` (должен быть `toUserId`), transfer `PENDING` → `ACCEPTED`, обновление `assigneeId`.

**POST /task-transfers/:id/reject** - body `{ userId, rejectionReason }`, transfer `PENDING` → `REJECTED`, `assigneeId` не меняется.

## Notes

| Метод | Путь | Query | Описание |
|-------|------|-------|----------|
| GET | `/notes` | `actorUserId` (обяз.) | Список личных заметок актора |
| GET | `/notes/:id` | `actorUserId` (обяз.) | Одна заметка (только своя) |
| POST | `/notes` | - | Создать заметку |
| PATCH | `/notes/:id` | - | Обновить текст (только своя) |

**POST /notes**: `actorUserId`, `text`, `source` (`WEB` | `TELEGRAM_TEXT` | `TELEGRAM_VOICE`); опционально legacy `creatorId` (должен совпадать с `actorUserId`). Проект не используется.

## Budgets

| Метод | Путь | Query | Описание |
|-------|------|-------|----------|
| GET | `/budgets` | `projectId?`, `status?`, `includeArchived?`, `userId?` | Список бюджетов (по умолчанию только `ACTIVE`) |
| POST | `/budgets` | - | Создать бюджет |
| PATCH | `/budgets/:id` | - | Обновить бюджет (не для `ARCHIVED`) |
| POST | `/budgets/:id/archive` | - | Архивировать бюджет |
| GET | `/budgets/:id` | - | Бюджет, `accessUsers`, `expenses`, `totals` |
| GET | `/budgets/:id/expenses` | - | Расходы бюджета |
| POST | `/budgets/:id/expenses` | - | Добавить расход |

**POST /budgets** (`CreateBudgetDto`): `projectId`, `name`, `description?`, `amount`, `requiresReceipt?`, `matchingKeywords?` (строка через запятую - для бота), `accessUserIds?`, `createdById`.

**PATCH /budgets/:id** (`UpdateBudgetDto`): в т.ч. `matchingKeywords` (`string` или `null` для сброса).

**POST /budgets/:id/archive**: `archivedById` (OWNER/MANAGER), `archiveReason?`.

**Totals** (в списке и в `GET /budgets/:id`):

| Поле | Формула |
|------|---------|
| `confirmedSpent` | сумма расходов `APPROVED` |
| `pendingSpent` | сумма `PENDING_RECEIPT` |
| `totalSpent` | confirmed + pending |
| `confirmedRemaining` | amount − confirmedSpent |
| `projectedRemaining` | amount − totalSpent |
| `spent` | = confirmedSpent (совместимость) |

**POST /budgets/:id/expenses** (`CreateBudgetExpenseDto`):

```json
{
  "userId": "cuid",
  "actorUserId": "cuid",
  "amount": 1500.5,
  "currency": "RUB",
  "description": "реклама VK",
  "expenseDate": "2026-05-19T12:00:00.000Z",
  "source": "TELEGRAM_TEXT",
  "hasReceipt": false
}
```

Правила: бюджет `ACTIVE`; доступ - OWNER/MANAGER или `BudgetAccess`; при `requiresReceipt` и без чека - `PENDING_RECEIPT`, иначе `APPROVED`. `spentAmount` увеличивается только для `APPROVED`. Прикрепление чека (`POST .../attachments`) переводит `PENDING_RECEIPT` → `APPROVED`.

## Budget expenses (вложения)

| Метод | Путь | Query | Описание |
|-------|------|-------|----------|
| GET | `/budget-expenses/pending` | `userId` (обяз.), `limit?` (default 10, max 20) | Неподтверждённые расходы пользователя (`PENDING_RECEIPT`, бюджет `ACTIVE`) |
| GET | `/budget-expenses/:expenseId/attachments` | - | Список вложений расхода |
| POST | `/budget-expenses/:expenseId/attachments` | Прикрепить чек (метаданные Telegram) |
| POST | `/budget-expenses/:expenseId/receipt` | Загрузить чек из Web (`multipart/form-data`) |
| GET | `/budget-expense-attachments/:id/preview` | Предпросмотр чека (Telegram или локальный файл) |
| GET | `/budget-expense-attachments/:id/download` | Скачать чек |
| GET | `/budget-expense-attachments/:id/open` | **Deprecated** - redirect на Telegram URL |

**POST /budget-expenses/:expenseId/receipt** - `multipart/form-data`:

- `file` - JPEG, PNG, WebP или PDF (до 10 MB)
- `uploadedById` - пользователь с доступом к бюджету (OWNER/MANAGER или `BudgetAccess`)

Логика: бюджет `ACTIVE`; файл сохраняется в `UPLOAD_DIR` (по умолчанию `uploads/receipts/{orgId}/…`), создаётся `BudgetExpenseAttachment` с `storageKey`; расход `PENDING_RECEIPT` → `APPROVED`, `spentAmount` увеличивается. Ответ - расход с `attachments`.

Переменная окружения: `UPLOAD_DIR` (опционально, абсолютный или относительный путь от cwd API).

**GET /budget-expenses/pending** - элемент ответа:

```json
{
  "id": "cuid",
  "amount": 1500,
  "description": "карандаши",
  "status": "PENDING_RECEIPT",
  "createdAt": "2026-05-23T10:00:00.000Z",
  "budget": {
    "id": "cuid",
    "name": "Закупка канцелярии",
    "status": "ACTIVE",
    "requiresReceipt": true,
    "project": { "id": "cuid", "name": "Реклама VK" }
  },
  "attachments": []
}
```

Фильтры: `organizationId` из контекста; `userId` в org; `expense.userId = userId`; `status = PENDING_RECEIPT`; `budget.status = ACTIVE`; сортировка `createdAt desc`.

**POST attachment** - пример для бота:

```json
{
  "telegramFileId": "AgACAgIAAxkBAAI...",
  "originalFilename": "photo.jpg",
  "mimeType": "image/jpeg",
  "uploadedById": "cuid"
}
```

`storageKey` в S3 опционален; для MVP достаточно `telegramFileId`.

Права на `POST .../attachments`: автор расхода (`expense.userId`) или **OWNER** / **MANAGER**; бюджет не в архиве. Для `PENDING_RECEIPT` статус → `APPROVED` и увеличивается `spentAmount`.

**Preview / download** - backend вызывает Telegram `getFile`, скачивает файл и отдаёт клиенту. `TELEGRAM_BOT_TOKEN` используется только на сервере API (тот же `.env`, что у бота). Web показывает чек в модальном окне через `/preview`, скачивание - через `/download`.

## Absences

| Метод | Путь | Query | Описание |
|-------|------|-------|----------|
| GET | `/absences` | `projectId?`, `userId?`, `type?`, `status?`, `includeCancelled?` | Список отсутствий (по умолчанию без `CANCELLED`) |
| GET | `/absences/:id` | `projectId?` | Одно отсутствие; при `projectId` - `affectedTasks` по проекту |
| GET | `/absences/:id/affected-tasks` | `projectId?` | Затронутые задачи (по org или по проекту) |
| POST | `/absences` | - | Создать отсутствие (+ `affectedTasks` в ответе) |
| POST | `/absences/:id/notifications` | - | Идемпотентная запись отправленного уведомления |
| PATCH | `/absences/:id/status` | - | Сменить статус |
| POST | `/absences/:id/cancel` | - | Отменить отсутствие (soft delete, `status` = `CANCELLED`) |

**POST /absences** (`CreateAbsenceDto`):

```json
{
  "userId": "cuid",
  "type": "SICK_LEAVE",
  "startDate": "2026-05-20",
  "endDate": "2026-05-25",
  "documentNumber": "123456",
  "comment": "опционально",
  "status": "APPROVED",
  "projectId": "опционально - ограничить affectedTasks проектом"
}
```

По умолчанию `status` = `APPROVED`. `endDate` не может быть раньше `startDate`. `userId` должен быть в текущей организации.

Ответ **POST** и элементы списка включают `affectedTasks` (без `projectId` в POST - по всей организации):

- `assigneeId` = пользователь отсутствия;
- `deadlineAt` в `[startDate, endDate]` включительно;
- `status` ∈ `NEW`, `IN_PROGRESS`;
- для каждой задачи: `project`, `creator`, `assignee` (с `telegramId`).

**GET /absences/:id/affected-tasks** - тот же набор полей, что в `affectedTasks` выше.

**POST /absences/:id/notifications** (идемпотентно):

```json
{
  "taskId": "cuid",
  "userId": "cuid",
  "type": "ABSENCE_AFFECTED_TASKS_EMPLOYEE"
}
```

Типы: `ABSENCE_AFFECTED_TASKS_EMPLOYEE`, `ABSENCE_AFFECTED_TASK_CREATOR`, `ABSENCE_TASK_DELEGATED_CREATOR`. Уникальность: `(absenceId, taskId, userId, type)`.

**GET /absences?projectId=…`** - только отсутствия участников проекта (`ProjectMember`). В каждом элементе:

- поля отсутствия и `user` (`id`, `fullName`, `role`);
- `affectedTasks` - только задачи этого проекта (те же правила фильтра).

**PATCH /absences/:id/status**:

```json
{ "status": "APPROVED" }
```

**POST /absences/:id/cancel** (`CancelAbsenceDto`):

```json
{
  "cancelledById": "cuid",
  "cancellationReason": "Удалено через Web"
}
```

Права: `OWNER` / `MANAGER` - любое отсутствие организации; сотрудник - только своё (`userId` = его id). Устанавливает `status` = `CANCELLED`, `cancelledAt`, `cancelledById`, `cancellationReason` (trimmed или `null`). Ответ включает `user`, `cancelledBy`. Если уже `CANCELLED` - **409** «Отсутствие уже удалено». Нет прав - **403**.

**GET /absences** - по умолчанию записи со статусом `CANCELLED` скрыты. Query `includeCancelled=true` возвращает все статусы.

Типы: `SICK_LEAVE`, `VACATION`. Статусы: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`.

**GET /projects/:id/summary** - `absencesTotal` без `CANCELLED`; `absencesActiveNow` - одобренные (`APPROVED`) отсутствия, пересекающиеся с сегодняшним днём.

## Коды ошибок

- **400** - валидация DTO, бизнес-ограничения (сумма ≤ 0, неверный статус).
- **404** - сущность не найдена или не принадлежит org.
- **502** - ошибка Telegram API при загрузке вложения.

## Модули NestJS

```
app.module
├── PrismaModule         # @neportal/database
├── OrganizationModule   # контекст org (OnModuleInit)
├── UsersModule          # импортирует TelegramModule для уведомлений
├── ProjectsModule
├── TasksModule
├── BudgetsModule
├── BudgetExpensesModule # расходы + attachments (preview/download)
├── NotesModule
└── AbsencesModule

telegram/
└── TelegramModule       # TelegramNotifyService - sendMessage при отвязке
```

`UsersService` при `DELETE /users/:id/telegram` вызывает `TelegramNotifyService` (тот же `TELEGRAM_BOT_TOKEN`, что у бота).

Prisma подключается через `PrismaModule` из `@neportal/database`.
