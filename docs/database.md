# База данных

Схема: `packages/database/prisma/schema.prisma`  
Клиент: `@neportal/database` (`PrismaClient` + Nest `PrismaModule`).

## ER-обзор (упрощённо)

```mermaid
erDiagram
  Organization ||--o{ User : has
  Organization ||--o{ Project : has
  Organization ||--o{ Task : has
  Organization ||--o{ Note : has
  Organization ||--o{ Budget : has
  Organization ||--o{ BudgetExpense : has
  Organization ||--o{ Absence : has
  Organization ||--o{ Reminder : has

  Project ||--o{ ProjectMember : has
  Project ||--o{ Task : contains
  Project ||--o{ Note : contains
  Project ||--o{ Budget : contains

  User ||--o{ Task : creates
  User ||--o{ Task : assigned
  Budget ||--o{ BudgetExpense : has
  BudgetExpense ||--o{ BudgetExpenseAttachment : has
  Task ||--o{ Reminder : optional
```

## Ключевые сущности

### Organization

Мультитенант на уровне данных; в MVP API работает с одной записью. Поля: `name`, `slug` (unique), `status`.

### User

- Роли org: `OWNER`, `MANAGER`, `EMPLOYEE`, `ACCOUNTANT` (`UserRole`).
- Опционально `telegramId` (unique) — связь с Telegram после подтверждения в боте.
- Опционально `telegramUsername` — для **первичной** привязки в боте (unique в рамках `organizationId`; несколько `NULL` допустимы). Нормализация: trim, без `@`, lowercase.
- `telegramId` — постоянная связь после `/start`; отвязка (`DELETE /users/:id/telegram`) или архивация сотрудника обнуляет `telegramId` и `telegramUsername`.
- `status` — `ARCHIVED` при soft delete (`DELETE /users/:id`).
- Связи: проекты, задачи, бюджеты, расходы, отсутствия, напоминания.

### Project

- `createdBy`, участники через `ProjectMember` с ролями `MANAGER`, `MEMBER`, `VIEWER`.
- Дочерние: tasks, notes, budgets.

### Task

Статусы: `NEW`, `IN_PROGRESS`, `DONE`, `CANCELLED`.  
Опционально `projectId`, `assigneeId`, `deadlineAt`, `completedAt`, `cancelledAt`.

### Note

Источник: `WEB`, `TELEGRAM_TEXT`, `TELEGRAM_VOICE`. Текст + привязка к проекту.

### Budget

- `initialAmount`, `spentAmount`, `currency` (по умолчанию RUB).
- Статус: `ACTIVE`, `EXHAUSTED`, `ARCHIVED`.

### BudgetExpense

- Статус: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`.
- Источник: `WEB`, `TELEGRAM_TEXT`, `TELEGRAM_VOICE`.
- Согласование: `approvedById`, `approvedAt`.

### BudgetExpenseAttachment

- `storageKey` — для S3 (nullable).
- `telegramFileId` — для чеков из бота.
- `uploadedBy` — пользователь, загрузивший файл.

### Absence

- Типы: `SICK_LEAVE`, `VACATION` (`AbsenceType`).
- Статусы: `PENDING`, `APPROVED`, `REJECTED` (`AbsenceStatus`); при создании через бота/API MVP по умолчанию `APPROVED`.
- Поля: `userId`, `startDate`, `endDate`, опционально `documentNumber`, `comment`.
- REST: модуль `AbsencesModule` — см. [api.md](api.md).
- В выдаче по проекту — `affectedTasks` (задачи исполнителя с `deadlineAt` в периоде отсутствия).

### Reminder

Модель для напоминаний по задачам; UI и API в MVP не реализованы.

## Enum'ы (кратко)

| Enum | Значения |
|------|----------|
| EntityStatus | ACTIVE, ARCHIVED, DELETED |
| TaskStatus | NEW, IN_PROGRESS, DONE, CANCELLED |
| BudgetStatus | ACTIVE, EXHAUSTED, ARCHIVED |
| ExpenseStatus | PENDING, APPROVED, REJECTED, CANCELLED |
| AbsenceType | SICK_LEAVE, VACATION |
| AbsenceStatus | PENDING, APPROVED, REJECTED |
| ReminderStatus | SCHEDULED, SENT, CANCELLED |

Дублирование части enum'ов в `@neportal/shared` — для кода вне Prisma (см. [packages.md](packages.md)).

## Миграции

Файлы: `packages/database/prisma/migrations/`.

Из корня:

```bash
pnpm db:migrate    # prisma migrate dev
pnpm db:generate   # только клиент
pnpm db:push       # без файлов миграций
pnpm db:studio     # GUI
```

**Не** вызывайте Prisma из `packages/database` без `dotenv -e .env` из корня — `DATABASE_URL` не подставится.

## Демо-данные (seed)

Команда: `pnpm db:seed`  
Скрипт: `packages/database/prisma/seed.ts`

Перед созданием удаляется org с `slug = neportal-demo` (сначала `BudgetExpenseAttachment`, иначе FK на `uploadedById`), затем org создаётся заново:

| Сущность | Детали |
|----------|--------|
| Организация | Neportal Demo, `neportal-demo` |
| Пользователи | Иван (OWNER), Вася, Петр (EMPLOYEE), Мария (ACCOUNTANT) |
| `telegramUsername` | `demo_ivan`, `demo_vasya` — не реальные username |
| `telegramId` | `seed-demo-ivan` у Ивана; у Васи пусто до `/start` |
| Проект | «Реклама VK», участники с ролями |
| Бюджет | 50 000 RUB, название «Реклама VK» |
| Задачи | «Подготовить отчет» (Вася); «Подписать договор с подрядчиком» (Иван, deadline конец 22.05.2026 UTC — `ensureDemoContractTask`, без дублей) |

Бот и документация предполагают проект **«Реклама VK»** как проект по умолчанию.
