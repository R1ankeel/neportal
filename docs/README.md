# Документация Neportal

Neportal — монорепозиторий для внутреннего портала организации: проекты, задачи, заметки, бюджеты и расходы, сотрудники, отсутствия. В MVP веб-интерфейс и Telegram-бот работают с общим REST API и одной демо-организацией в базе.

## Содержание

| Документ | О чём |
|----------|--------|
| [Быстрый старт](getting-started.md) | Установка, Docker, миграции, сид, запуск `pnpm dev` |
| [Архитектура](architecture.md) | Компоненты, потоки данных, контекст организации, планы развития |
| [REST API](api.md) | Эндпоинты, тела запросов, Swagger, ограничения MVP |
| [База данных](database.md) | Prisma-модели, enum'ы, миграции, демо-данные |
| [Веб-приложение](web.md) | Next.js, маршруты, серверный fetch к API |
| [Telegram-бот](bot.md) | Команды, интеграция с API, чеки к расходам |
| [Пакеты](packages.md) | `@neportal/database`, `shared`, `permissions`, `ai-contracts` |

Краткая шпаргалка по репозиторию — в корневом [README.md](../README.md).

## Стек

- **Монорепо:** pnpm workspaces + Turborepo
- **Web:** Next.js 15 (App Router), React, Tailwind CSS
- **API:** NestJS, class-validator, Swagger (`/docs`)
- **Бот:** grammY (TypeScript)
- **БД:** PostgreSQL 16, Prisma ORM
- **Инфра локально:** Docker Compose (Postgres + Redis; Redis зарезервирован под будущие фичи)

## Порты

| Сервис | URL по умолчанию |
|--------|------------------|
| Web | http://localhost:3000 |
| API | http://localhost:4000 |
| Swagger | http://localhost:4000/docs |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

## Ограничения MVP (важно)

- **Нет аутентификации** в API: все запросы обслуживаются в контексте одной организации (`NEPORTAL_ORG_SLUG` или `NEPORTAL_ORGANIZATION_ID`).
- **Web** не реализует логин; страницы доверяют API и демо-данным сида.
- **Отсутствия** — бот `/sick`, `/vacation`, API `GET/POST /absences`, вкладка проекта в Web — см. [api.md](api.md), [bot.md](bot.md).
- **S3 / Yandex Cloud** в `.env.example` — заготовки под голос, GPT и хранение файлов; в MVP чеки из Telegram хранятся как `telegramFileId`, открытие — через redirect API.
