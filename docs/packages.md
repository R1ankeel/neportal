# Пакеты (`packages/`)

## `@neportal/database`

| Путь | Назначение |
|------|------------|
| `prisma/schema.prisma` | Модели и enum'ы |
| `prisma/migrations/` | SQL-миграции |
| `prisma/seed.ts` | Демо-данные |
| `src/prisma.service.ts` | Nest injectable |
| `src/prisma.module.ts` | Global Prisma module |
| `src/index.ts` | Re-export client + enums |

Зависимости приложений: `apps/api` импортирует `PrismaModule` и типы enum из `@prisma/client` через пакет.

## `@neportal/shared`

- **`loadRootEnv()`** — поиск `.env` от `process.cwd()` вверх (до 8 уровней), затем `dotenv.config`. Не логирует значения секретов.
- **`EntityStatus`** и прочие enum'ы в `src/enums.ts` — подмножество, синхронизированное с доменом (не все Prisma-enum'ы).

Используют: `apps/api`, `apps/bot` при bootstrap.

## `@neportal/permissions`

Заготовка RBAC вне Prisma:

- `Role`: Owner, Admin, Member, Guest
- `Permission`: `org.read`, `org.write`, `users.read`, …
- `roleHasPermission(role, permission)`

**Не подключена** к Nest API в MVP; в БД используются `UserRole` / `ProjectRole` из Prisma.

## `@neportal/ai-contracts`

Zod-схемы для ответа **YandexGPT intent parser** (только разбор текста, без выполнения действий).

Корневой тип **`AiIntent`** — discriminated union по полю `intent`:

| `intent` | Ключевые поля `payload` |
|----------|-------------------------|
| `create_task` | `title`, `assigneeHint?`, `projectHint?`, `deadlineDate?` (ISO) |
| `create_note` | `text`, `projectHint?` |
| `create_expense` | `amount`, `projectHint?`, `budgetHint?`, `description?` |
| `create_absence` | `type`, `endDate`, `userHint?`, `startDate?`, … |
| `set_task_deadline` | `taskTitle`, `deadlineDate` |
| `unknown` | `reason?` |

Общие поля ответа: `confidence` (0–1), `requiresConfirmation` (boolean).

**Экспорт:** `AiIntentSchema`, `CreateTaskPayloadSchema`, …, `parseAiIntent`, `safeParseAiIntent`, `preprocessAiIntentInput`.

Сборка: `pnpm --filter @neportal/ai-contracts build` → `dist/`.  
Потребитель: `apps/bot` через `src/ai-contracts.ts` (прямой `require` на `dist`, см. [ai-intent.md](ai-intent.md)).

Поля `version` / `action` / `entity` из старого черновика **удалены**.

## Зависимости между пакетами

```
apps/api  ──► @neportal/database
          ──► @neportal/shared

apps/bot  ──► @neportal/shared
          ──► @neportal/ai-contracts (workspace; runtime — dist монорепо)

apps/web  ──► (прямого импорта database нет, только HTTP API)
```

## pnpm `allowBuilds`

В `pnpm-workspace.yaml` разрешены postinstall-скрипты для `prisma`, `@nestjs/core`, `sharp`, `esbuild` и др. При добавлении пакетов с native build при необходимости допишите имя в список.
