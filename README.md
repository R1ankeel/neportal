# Neportal

Monorepo на [pnpm](https://pnpm.io/) и [Turborepo](https://turbo.build/) для веб-клиента, API, Telegram-бота и общих пакетов.

## Структура

| Путь | Описание |
|------|----------|
| `apps/web` | Next.js 15 (App Router) + Tailwind — MVP-панель (дашборд, проекты, задачи, бюджеты) |
| `apps/api` | NestJS + TypeScript |
| `apps/bot` | Node.js + TypeScript + [grammY](https://grammy.dev/) |
| `packages/database` | Prisma schema и Prisma Client |
| `packages/shared` | Общие типы и enums |
| `packages/permissions` | Роли и права |
| `packages/ai-contracts` | Zod-схемы для AI intent parsing |

## Требования

- Node.js 20+
- pnpm (версия зафиксирована в `package.json` → `packageManager`; рекомендуется [Corepack](https://nodejs.org/api/corepack.html))

## Быстрый старт

1. Скопируйте переменные окружения и при необходимости отредактируйте их:

```bash
cp .env.example .env
```

2. Поднимите Postgres и Redis:

```bash
docker compose up -d
```

3. Установите зависимости и сгенерируйте Prisma Client:

```bash
pnpm install
pnpm db:generate
```

4. Запуск в режиме разработки (все приложения и пакеты с `dev`). Первый запуск сначала соберёт внутренние пакеты (`turbo` → `dependsOn: ^build`), затем поднимет dev-серверы.

```bash
pnpm dev
```

Запускайте команды из **корня** репозитория, чтобы бот подхватил `.env`. При необходимости можно задать `NEPORTAL_ENV_PATH` с абсолютным путём к `.env`.

Отдельные приложения:

```bash
pnpm --filter @neportal/web dev
pnpm --filter @neportal/api dev
pnpm --filter @neportal/bot dev
```

Сборка всего монорепозитория:

```bash
pnpm build
```

## Порты по умолчанию

- Web: `http://localhost:3000`
- API: `http://localhost:4000` (переопределение через `API_PORT`)

## База данных

Переменная `DATABASE_URL` должна указывать на Postgres (см. `.env.example` и `docker-compose.yml`).

Из **корня** монорепозитория:

| Команда | Действие |
|---------|----------|
| `pnpm db:generate` | `prisma generate` (клиент без миграций) |
| `pnpm db:migrate` | `prisma migrate dev` (применить миграции из `packages/database/prisma/migrations`) |
| `pnpm db:push` | `prisma db push` (прототипирование без файлов миграций) |
| `pnpm db:seed` | `prisma db seed` — демо-данные **Neportal Demo** (`slug`: `neportal-demo`) |
| `pnpm db:studio` | Prisma Studio |

Из каталога пакета (`pnpm --filter @neportal/database exec …`) доступны те же команды через скрипты `db:migrate`, `db:seed`, `db:studio` в `packages/database/package.json`.

Сид запускается через `tsx` (локальный devDependency пакета `@neportal/database`). Для демо-пользователей заданы уникальные строковые `telegramId` вида `seed-demo-*`, чтобы не пересекаться с реальными Telegram ID.

## REST API (MVP)

После миграций и сида: `pnpm --filter @neportal/api dev`.

- **Swagger:** `http://localhost:4000/docs` (порт — `API_PORT`)
- Контекст организации: `NEPORTAL_ORG_SLUG` (по умолчанию `neportal-demo`) или явный `NEPORTAL_ORGANIZATION_ID` в `.env`.

Эндпоинты: `GET /health`, `GET /users`, `GET /users/:id`, `GET|POST /projects`, `GET /projects/:id`, `GET|POST /tasks`, `PATCH /tasks/:id/status`, `GET|POST /budgets`, `GET /budgets/:id`, `GET|POST /budgets/:id/expenses`.

**apps/web:** страницы делают серверный `fetch` к `API_URL` (или `NEXT_PUBLIC_API_URL`) из `.env`. Для локальной разработки задайте тот же хост, что и у API (см. `.env.example`).

## pnpm 11 и сборки зависимостей

В `pnpm-workspace.yaml` включён `allowBuilds` для пакетов с обязательными postinstall-скриптами (Prisma, Nest, `sharp`, `esbuild` и т.д.). При добавлении новых зависимостей с install-скриптами при необходимости допишите их в этот список.

## Telegram-бот

В `.env` задайте `TELEGRAM_BOT_TOKEN` и **`API_URL`** (бот дергает `POST /tasks` и `GET /users` на том же хосте, что и web).

Команды MVP: `/start`, `/demo`, `/task <текст>` (создание задачи: автор — Иван из сида, исполнитель — Вася, если найдены в `GET /users`).

Для локальной разработки по умолчанию используется long polling (`BOT_MODE` не задан или `polling`). Для webhook установите `BOT_MODE=webhook` и `TELEGRAM_WEBHOOK_URL`.

## Полезное

- Форматирование: `pnpm format`
- Линт всех пакетов с задачей `lint`: `pnpm lint`
