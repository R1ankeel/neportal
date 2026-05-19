# Neportal

Monorepo на [pnpm](https://pnpm.io/) и [Turborepo](https://turbo.build/) для веб-клиента, API, Telegram-бота и общих пакетов.

## Структура

| Путь | Описание |
|------|----------|
| `apps/web` | Next.js 15 (App Router) + Tailwind — MVP вокруг **проектов**: `/projects`, `/projects/[id]` (вкладки: обзор, задачи, заметки, бюджеты, отсутствия), `/employees`; глобальные `/tasks` и `/budgets` без пункта в меню |
| `apps/api` | NestJS + TypeScript |
| `apps/bot` | Node.js + TypeScript + [grammY](https://grammy.dev/) |
| `packages/database` | Prisma schema и Prisma Client |
| `packages/shared` | Общие типы, enums и **`loadRootEnv()`** — поиск и загрузка корневого `.env` |
| `packages/permissions` | Роли и права |
| `packages/ai-contracts` | Zod-схемы для AI intent parsing |

## Требования

- Node.js 20+
- pnpm (версия зафиксирована в `package.json` → `packageManager`; рекомендуется [Corepack](https://nodejs.org/api/corepack.html))

## Переменные окружения (один `.env` в корне)

- Файл **`.env` создаётся только в корне** монорепозитория (`cp .env.example .env`). Секреты и URL не коммитьте.
- **Копировать** `.env` в `apps/api`, `apps/bot`, `packages/database` **не нужно** — все команды из корня подхватывают корневой файл.
- Загрузка:
  - **API и бот** при старте вызывают `loadRootEnv()` из `@neportal/shared`: подъём от `process.cwd()` до 8 уровней вверх в поисках `.env`, затем `dotenv.config` (секреты в лог не пишутся).
  - Опционально переменная **`NEPORTAL_ENV_PATH`** в **окружении ОС** (до запуска Node): если задана и файл существует — он загружается вместо поиска по дереву каталогов.
  - Скрипты **`pnpm db:*`** в корне оборачивают Prisma в **`dotenv-cli`**: `dotenv -e .env -- …`, рабочая директория пакета `@neportal/database` сохраняется, схема — `packages/database/prisma/schema.prisma`.
  - **Web** (`pnpm --filter @neportal/web dev|build|start`) подгружает **`../../.env`** относительно `apps/web` через `dotenv-cli`. Для **`build`** и **`start`** после загрузки `.env` принудительно выставляется **`NODE_ENV=production`**, иначе значение `NODE_ENV=development` из `.env` ломает production-сборку Next.js (в т.ч. ошибка про `<Html>` при пререндере `/404`).

Запускайте `pnpm`, `pnpm db:*` и `pnpm --filter …` **из корня репозитория** (Windows PowerShell, macOS, Linux), чтобы `cwd` и пути к `.env` совпадали с ожидаемыми.

## Быстрый старт

1. Скопируйте переменные окружения в **корень** репозитория и при необходимости отредактируйте:

```bash
cp .env.example .env
```

2. Поднимите Postgres и Redis:

```bash
docker compose up -d
```

3. Установите зависимости и Prisma Client:

```bash
pnpm install
pnpm db:generate
```

4. Миграции и сид (из корня, с подхватом `DATABASE_URL` из корневого `.env`):

```bash
pnpm db:migrate
pnpm db:seed
```

5. Запуск в режиме разработки — все приложения с `dev` (`turbo` сначала соберёт зависимости `^build`):

```bash
pnpm dev
```

Отдельные приложения (тоже из **корня**):

```bash
pnpm --filter @neportal/web dev
pnpm --filter @neportal/api dev
pnpm --filter @neportal/bot dev
```

6. Сборка всего монорепозитория:

```bash
pnpm build
```

## Troubleshooting

| Симптом | Что сделать |
|--------|-------------|
| `Environment variable not found: DATABASE_URL` (Prisma / API) | Убедитесь, что в **корне** есть `.env` с `DATABASE_URL`. Команды `pnpm db:*` и `pnpm --filter @neportal/api dev` запускайте из корня клона. Не копируйте `.env` в `packages/database`. |
| `Set TELEGRAM_BOT_TOKEN in the root .env file` | Задайте `TELEGRAM_BOT_TOKEN` в **корневом** `.env`, затем снова `pnpm --filter @neportal/bot dev` из корня. |
| Странные пути вроде `C:\Windows\System32` в ошибках, «не находит» проект или `.env` | Текущая директория не корень репозитория: выполните `cd` в каталог с `package.json` монорепозитория и повторите команду. |
| Запуск Prisma из `packages/database` без переменных | Используйте скрипты **`pnpm db:migrate`** / **`pnpm db:seed`** из корня (они подставляют корневой `.env` через `dotenv-cli`). |
| `next build` / `<Html> should not be imported outside of pages/_document` при пререндере `/404` | Часто из‑за **`NODE_ENV=development`** из `.env` на этапе сборки. В `@neportal/web` скрипт `build` уже задаёт **`NODE_ENV=production`** поверх `.env`; не отключайте это при кастомных командах. |

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

Прямой вызов `pnpm --filter @neportal/database exec prisma …` **без** корневого `dotenv -e .env` не подставит переменные из корневого `.env`; для повседневной работы используйте команды **`pnpm db:*`** из корня.

Сид запускается через `tsx` (локальный devDependency пакета `@neportal/database`). Для демо-пользователей заданы уникальные строковые `telegramId` вида `seed-demo-*`, чтобы не пересекаться с реальными Telegram ID.

## REST API (MVP)

После миграций и сида: `pnpm --filter @neportal/api dev`.

- **Swagger:** `http://localhost:4000/docs` (порт — `API_PORT`)
- Контекст организации: `NEPORTAL_ORG_SLUG` (по умолчанию `neportal-demo`) или явный `NEPORTAL_ORGANIZATION_ID` в `.env`.

Эндпоинты: `GET /health`, `GET /users`, `GET /users/:id`, `GET|POST /projects`, `GET /projects/:id`, `GET /projects/:id/summary` (сводка по задачам и бюджетам проекта), `GET|POST /tasks` (опционально `?projectId=`), `PATCH /tasks/:id/status`, `GET|POST /budgets` (опционально `?projectId=`), `GET /budgets/:id`, `GET|POST /budgets/:id/expenses`, `GET /notes` (опционально `?projectId=`).

**apps/web:** страницы делают серверный `fetch` к `API_URL` (или `NEXT_PUBLIC_API_URL`) из `.env`. Для локальной разработки задайте тот же хост, что и у API (см. `.env.example`).

## pnpm 11 и сборки зависимостей

В `pnpm-workspace.yaml` включён `allowBuilds` для пакетов с обязательными postinstall-скриптами (Prisma, Nest, `sharp`, `esbuild` и т.д.). При добавлении новых зависимостей с install-скриптами при необходимости допишите их в этот список.

## Telegram-бот

В **корневом** `.env` задайте `TELEGRAM_BOT_TOKEN` и **`API_URL`** (бот дергает `POST /tasks` и `GET /users` на том же хосте, что и web).

Команды MVP: `/start`, `/demo`, `/task <текст>` (создание задачи в выбранном по умолчанию проекте организации: предпочтительно «Реклама VK», иначе первый из `GET /projects`; автор — Иван из сида, исполнитель — Вася, если найдены в `GET /users`). Если проектов нет, бот ответит, что нужно создать проект в Web.

Для локальной разработки по умолчанию используется long polling (`BOT_MODE` не задан или `polling`). Для webhook установите `BOT_MODE=webhook` и `TELEGRAM_WEBHOOK_URL`.

## Полезное

- Форматирование: `pnpm format`
- Линт всех пакетов с задачей `lint`: `pnpm lint`
