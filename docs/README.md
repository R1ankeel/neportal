# Документация Neportal

Neportal — монорепозиторий для внутреннего портала организации: проекты, задачи, заметки, бюджеты и расходы, сотрудники, отсутствия. В MVP веб-интерфейс и Telegram-бот работают с общим REST API и одной демо-организацией в базе.

**Нетехническое описание продукта**: [корневой README.md](../README.md).

**Новому разработчику:** начните с [Руководства разработчика](developer-guide.md) (онбординг за 30–60 минут), затем [Быстрый старт](getting-started.md).

## Содержание

| Документ | О чём |
|----------|--------|
| [**Руководство разработчика**](developer-guide.md) | Онбординг: архитектура, карта кода, сценарии, как вносить изменения |
| [Быстрый старт](getting-started.md) | Установка, Docker, миграции, сид, запуск `pnpm dev` |
| [Переменные окружения](env.md) | Справочник `.env`, кто как загружает конфиг |
| [Архитектура](architecture.md) | Компоненты, потоки данных, контекст организации, планы развития |
| [REST API](api.md) | Эндпоинты, тела запросов, Swagger, ограничения MVP |
| [База данных](database.md) | Prisma-модели, enum'ы, миграции, демо-данные |
| [Веб-приложение](web.md) | Next.js, маршруты, серверный fetch к API |
| [Telegram-бот](bot.md) | Команды, inline-кнопки подтверждения/выбора (текстовый fallback), детерминированный разбор дедлайнов, AI provider (YandexGPT / Qwen), чеки |
| [AI intent](ai-intent.md) | Контракт JSON, classifier + extractor, `AiProvider`, env |
| [Пакеты](packages.md) | `@neportal/database`, `shared`, `permissions`, `ai-contracts` |

Корневой [README.md](../README.md) — описание для нетехнической аудитории; быстрый старт разработчика — [getting-started.md](getting-started.md).

## Порядок чтения для онбординга

1. [developer-guide.md](developer-guide.md) — контекст и «куда лезть в коде»
2. [getting-started.md](getting-started.md) — поднять окружение
3. [architecture.md](architecture.md) + [env.md](env.md)
4. По роли: [api.md](api.md) / [web.md](web.md) / [bot.md](bot.md)
5. [database.md](database.md) при работе со схемой; [ai-intent.md](ai-intent.md) при доработке бота

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
- **Разбор текста в боте** — детерминированные парсеры (в т.ч. дедлайны задач), опционально **двухэтапный LLM**; подтверждение и выбор — **inline-кнопки** с текстовым fallback; см. [bot.md](bot.md), [ai-intent.md](ai-intent.md).
- **Бюджеты** — intent `create_budget`, поле `matchingKeywords` для выбора бюджета при расходах; чеки из Telegram (`telegramFileId`) и загрузка из Web (`UPLOAD_DIR`, `POST .../receipt`).
- **S3 / SpeechKit** в `.env.example` — заготовки; постоянное хранение вложений в S3 не в MVP.
