# Быстрый старт

Перед установкой полезно прочитать [Руководство разработчика](developer-guide.md) — там описаны архитектура и сквозные сценарии проверки.

## Требования

- **Node.js** 20+
- **pnpm** 11+ (версия в `package.json` → `packageManager`; удобно через [Corepack](https://nodejs.org/api/corepack.html))
- **Docker** — для Postgres и Redis

## 1. Переменные окружения

Скопируйте шаблон в **корень** репозитория (не в `apps/*`):

```bash
cp .env.example .env
```

Отредактируйте при необходимости:

- `DATABASE_URL` — должен совпадать с `docker-compose.yml`
- `TELEGRAM_BOT_TOKEN` — токен от [@BotFather](https://t.me/BotFather), если запускаете бота
- `API_URL` / `NEXT_PUBLIC_API_URL` — обычно `http://localhost:4000` для локальной разработки
- **YandexGPT** (опционально): `YANDEX_CLOUD_FOLDER_ID`, `YANDEX_GPT_API_KEY` или `YANDEX_CLOUD_IAM_TOKEN`, `YANDEX_GPT_MODEL_URI` — см. [ai-intent.md](ai-intent.md)

Подробнее о загрузке `.env` — [env.md](env.md), [architecture.md](architecture.md#переменные-окружения).

## 2. Инфраструктура

```bash
docker compose up -d
```

Проверка: Postgres на `5432`, Redis на `6379`, БД `neportal`, пользователь/пароль `postgres`/`postgres`.

## 3. Зависимости и Prisma

Из **корня** репозитория:

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Сид создаёт организацию **Neportal Demo** (`slug`: `neportal-demo`) с проектом «Реклама VK», бюджетом, задачей и пользователями (Иван, Вася, Петр, Мария). Подробнее — [database.md](database.md#демо-данные-seed).

## 4. Запуск

Все приложения с задачей `dev` (Turborepo сначала соберёт зависимости `^build`):

```bash
pnpm dev
```

По отдельности (тоже из корня):

```bash
pnpm --filter @neportal/web dev
pnpm --filter @neportal/api dev
pnpm --filter @neportal/bot dev
```

## 5. Проверка

1. API: http://localhost:4000/health → `{"status":"ok"}`
2. Swagger: http://localhost:4000/docs
3. Web: http://localhost:3000 → редирект в приложение, раздел «Проекты»
4. Бот: `/start` в Telegram после задания `TELEGRAM_BOT_TOKEN`
5. AI (если настроен Yandex): фраза «Запиши заметку: …» → preview → ответ `да` → заметка в Web на вкладке проекта

Локальные URL: Web `http://localhost:3000`, API `http://localhost:4000`, бот — polling (без публичного URL).

## Команды из корня

| Команда | Назначение |
|---------|------------|
| `pnpm build` | Production-сборка всех пакетов |
| `pnpm lint` | ESLint по workspace |
| `pnpm format` | Prettier |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:push` | Синхронизация схемы без файлов миграций (прототипирование) |

## Troubleshooting

| Симптом | Решение |
|---------|---------|
| `Environment variable not found: DATABASE_URL` | Файл `.env` в корне; команды `pnpm db:*` из корня клона (скрипт `scripts/prisma-with-root-env.mjs`, работает в cmd.exe). В cmd: `set DATABASE_URL=postgresql://...` затем prisma — только для одной сессии |
| `Set TELEGRAM_BOT_TOKEN in the root .env file` | Задать токен в корневом `.env`, не `change_me` |
| Пути вроде `C:\Windows\System32` в ошибках | `cd` в каталог с корневым `package.json` |
| `Organization slug "neportal-demo" not found` | Выполнить `pnpm db:seed` |
| Ошибка Next `<Html>` при `next build` | В `@neportal/web` скрипт `build` выставляет `NODE_ENV=production` поверх `.env`; не отключайте при кастомных командах |
| `pnpm db:seed` FK на `BudgetExpenseAttachment` | Сид удаляет вложения чеков перед пересозданием org; обновите `seed.ts` из репозитория |
| Бот: Zod `version` / `action` / `entity` | `pnpm --filter @neportal/ai-contracts build`, перезапуск бота |
