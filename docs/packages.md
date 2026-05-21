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

Zod-схема **`AiIntent`** (intent-based контракт для YandexGPT):

```typescript
{
  intent: "create_task" | "create_note" | "create_expense" | "create_absence" | "set_task_deadline" | "unknown",
  confidence: number,
  requiresConfirmation: boolean,
  payload: { ... } // зависит от intent
}
```

Функции: `parseAiIntent`, `safeParseAiIntent`, `preprocessAiIntentInput` (убирает legacy `version`/`action`/`entity`, если модель их вернула).

## Зависимости между пакетами

```
apps/api  ──► @neportal/database
          ──► @neportal/shared

apps/bot  ──► @neportal/shared

apps/web  ──► (прямого импорта database нет, только HTTP API)
```

## pnpm `allowBuilds`

В `pnpm-workspace.yaml` разрешены postinstall-скрипты для `prisma`, `@nestjs/core`, `sharp`, `esbuild` и др. При добавлении пакетов с native build при необходимости допишите имя в список.
