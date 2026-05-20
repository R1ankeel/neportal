# REST API

Базовый URL: `API_URL` (по умолчанию `http://localhost:4000`).

Интерактивная спецификация: **http://localhost:4000/docs** (Swagger UI).

## Общие правила

- Формат: JSON, `Content-Type: application/json`.
- Валидация: `ValidationPipe` (whitelist, лишние поля → 400).
- **Авторизация отсутствует** — подходит только для локальной разработки и демо.
- Все сущности привязаны к организации из `NEPORTAL_ORG_SLUG` / `NEPORTAL_ORGANIZATION_ID`.

## Health

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Проверка живости (`AppService`) |

## Users

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/users` | Список пользователей организации |
| GET | `/users/:id` | Пользователь по id |

## Projects

| Метод | Путь | Query | Описание |
|-------|------|-------|----------|
| GET | `/projects` | — | Все проекты org |
| POST | `/projects` | — | Создать проект |
| GET | `/projects/:id` | — | Проект с участниками |
| GET | `/projects/:id/summary` | — | Сводка: задачи, бюджеты, счётчики |

**POST /projects** (основные поля): `name`, `createdById`, опционально `description`.

## Tasks

| Метод | Путь | Query | Описание |
|-------|------|-------|----------|
| GET | `/tasks` | `projectId?` | Список задач |
| POST | `/tasks` | — | Создать задачу |
| PATCH | `/tasks/:id/status` | — | Сменить статус |

**POST /tasks** — тело (`CreateTaskDto`):

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

`projectId` опционален — без него задача «глобальная» в рамках org.

**PATCH /tasks/:id/status**:

```json
{ "status": "IN_PROGRESS" }
```

Статусы: `NEW`, `IN_PROGRESS`, `DONE`, `CANCELLED`.

## Notes

| Метод | Путь | Query | Описание |
|-------|------|-------|----------|
| GET | `/notes` | `projectId?` | Список заметок |
| GET | `/notes/:id` | — | Одна заметка |
| POST | `/notes` | — | Создать заметку |

**POST /notes**: `text`, `creatorId`, `source` (`WEB` | `TELEGRAM_TEXT` | `TELEGRAM_VOICE`), опционально `projectId`.

## Budgets

| Метод | Путь | Query | Описание |
|-------|------|-------|----------|
| GET | `/budgets` | `projectId?` | Список бюджетов |
| POST | `/budgets` | — | Создать бюджет |
| GET | `/budgets/:id` | — | Бюджет с расходами |
| GET | `/budgets/:id/expenses` | — | Расходы бюджета |
| POST | `/budgets/:id/expenses` | — | Добавить расход |

**POST /budgets/:id/expenses** (`CreateBudgetExpenseDto`):

```json
{
  "userId": "cuid",
  "amount": 1500.5,
  "currency": "RUB",
  "description": "реклама VK",
  "expenseDate": "2026-05-19T12:00:00.000Z",
  "source": "TELEGRAM_TEXT",
  "status": "PENDING"
}
```

При одобрении расхода обновляется `spentAmount` бюджета (логика в `BudgetsService` / `BudgetExpensesService`).

## Budget expenses (вложения)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/budget-expenses/:expenseId/attachments` | Список вложений расхода |
| POST | `/budget-expenses/:expenseId/attachments` | Прикрепить чек (метаданные Telegram) |
| GET | `/budget-expense-attachments/:id/open` | Получить URL для открытия файла (302 redirect) |

**POST attachment** — пример для бота:

```json
{
  "telegramFileId": "AgACAgIAAxkBAAI...",
  "originalFilename": "photo.jpg",
  "mimeType": "image/jpeg",
  "uploadedById": "cuid"
}
```

`storageKey` в S3 опционален; для MVP достаточно `telegramFileId`.

## Коды ошибок

- **400** — валидация DTO, бизнес-ограничения (сумма ≤ 0, неверный статус).
- **404** — сущность не найдена или не принадлежит org.
- **502** — ошибка Telegram API при открытии вложения.

## Модули NestJS

```
app.module
├── OrganizationModule   # контекст org
├── UsersModule
├── ProjectsModule
├── TasksModule
├── BudgetsModule
├── BudgetExpensesModule # attachments + open
└── NotesModule
```

Prisma подключается через `PrismaModule` из `@neportal/database`.
