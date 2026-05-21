# Neportal

Внутренний портал организации: **проекты**, **задачи**, **заметки**, **бюджеты и расходы**, **сотрудники**. Монорепозиторий на [pnpm](https://pnpm.io/) и [Turborepo](https://turbo.build/) с веб-клиентом, REST API и Telegram-ботом.

**Документация:** [docs/README.md](docs/README.md) · **Онбординг разработчика:** [docs/developer-guide.md](docs/developer-guide.md)

## Быстрый старт

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Подробнее: [docs/getting-started.md](docs/getting-started.md)

| Сервис | URL |
|--------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:4000 |
| Swagger | http://localhost:4000/docs |

## Структура репозитория

| Путь | Описание |
|------|----------|
| `apps/web` | Next.js 15 + Tailwind — UI |
| `apps/api` | NestJS — REST API |
| `apps/bot` | grammY — Telegram-бот |
| `packages/database` | Prisma + PostgreSQL |
| `packages/shared` | `loadRootEnv()`, общие типы |
| `packages/permissions` | RBAC (заготовка) |
| `packages/ai-contracts` | Zod-схемы для AI intent |
| `docs/` | Документация; старт — `docs/developer-guide.md` |

## Переменные окружения

Один файл **`.env` в корне** репозитория (шаблон: `.env.example`). Копировать в `apps/*` не нужно.

- API и бот: `loadRootEnv()` при старте
- `pnpm db:*`: `dotenv-cli -e .env`
- Web: `dotenv-cli` + `../../.env`; для `build`/`start` принудительно `NODE_ENV=production`

Все команды `pnpm` выполняйте **из корня** клона.

## Команды

| Команда | Действие |
|---------|----------|
| `pnpm dev` | Web + API + bot (development) |
| `pnpm build` | Production-сборка |
| `pnpm db:migrate` | Миграции Prisma |
| `pnpm db:seed` | Демо org `neportal-demo` |
| `pnpm db:studio` | Prisma Studio |

## MVP: что важно знать

- API **без авторизации**; одна организация — `NEPORTAL_ORG_SLUG=neportal-demo` (после сида).
- Бот: slash-команды (`/task`, `/note`, `/expense`, …) + **обычный текст** через YandexGPT (подтверждение «да»/«нет») → [docs/bot.md](docs/bot.md), [docs/ai-intent.md](docs/ai-intent.md).
- Локально: Web `:3000`, API `:4000`, Postgres/Redis в Docker; Yandex Cloud только как внешний API (GPT), без деплоя приложения.
- REST-справочник → [docs/api.md](docs/api.md).

## Troubleshooting

| Симптом | Решение |
|---------|---------|
| `DATABASE_URL` не найден | `.env` в корне; команды из корня репозитория |
| `TELEGRAM_BOT_TOKEN` | Задать в корневом `.env` |
| Org не найдена | `pnpm db:seed` |
| `db:seed` FK attachment | Пересоздание демо-org; нужна актуальная версия `seed.ts` |
| YandexGPT 401 / Zod `version` | См. [docs/bot.md](docs/bot.md) Troubleshooting |
| Ошибка Next `<Html>` при build | Не убирать `NODE_ENV=production` в скрипте `build` web-пакета |

## Лицензия и вклад

Приватный репозиторий (`"private": true` в `package.json`).
