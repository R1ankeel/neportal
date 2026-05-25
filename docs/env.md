# Переменные окружения

Один файл **`.env` в корне** репозитория. Шаблон: [`.env.example`](../.env.example). В `apps/*` и `packages/database` копии не нужны.

## Как подхватываются

| Способ | Кто |
|--------|-----|
| `loadRootEnv()` (`@neportal/shared`) | API, бот при старте — поиск `.env` вверх от `cwd` (до 8 уровней) |
| `NEPORTAL_ENV_PATH` | Явный абсолютный путь к файлу (до запуска Node) |
| `dotenv-cli -e .env` | Скрипты `pnpm db:*` в корневом `package.json` |
| `dotenv-cli -e ../../.env` | `@neportal/web` dev / build / start |

**Windows:** запускайте терминал с `cwd` = корень клона, иначе пути и `DATABASE_URL` «ломаются».

## Справочник

### Общие

| Переменная | Обязательно | По умолчанию | Назначение |
|------------|-------------|--------------|------------|
| `NODE_ENV` | нет | `development` | Режим Node; для `next build` web принудительно `production` в скрипте |
| `APP_URL` | нет | `http://localhost:3000` | Публичный URL веб-приложения |
| `API_URL` | нет* | `http://localhost:4000` | Базовый URL API (бот, серверный fetch Web) |
| `NEXT_PUBLIC_API_URL` | нет* | как `API_URL` | URL API из **браузера** (превью чеков, клиентский fetch) |

\* Для локальной работы достаточно значений из `.env.example`.

### База и кэш

| Переменная | Обязательно | Назначение |
|------------|-------------|------------|
| `DATABASE_URL` | **да** (для API и Prisma) | PostgreSQL; должен совпадать с `docker-compose.yml` |
| `REDIS_URL` | нет | Redis из Docker; в MVP **не используется** приложениями |

### API

| Переменная | Обязательно | По умолчанию | Назначение |
|------------|-------------|--------------|------------|
| `API_PORT` | нет | `4000` | Порт NestJS |
| `UPLOAD_DIR` | нет | `uploads` (cwd API) | Локальное хранение чеков, загруженных из Web (`POST .../receipt`) |
| `NEPORTAL_ORG_SLUG` | нет | `neportal-demo` | Slug организации для всех запросов (после `pnpm db:seed`) |
| `NEPORTAL_ORGANIZATION_ID` | нет | — | Если задан — приоритет над slug (CUID из БД) |
| `JWT_SECRET` | нет | — | **Не используется** в MVP; заготовка |

### Telegram

| Переменная | Обязательно | Назначение |
|------------|-------------|------------|
| `TELEGRAM_BOT_TOKEN` | **да** для бота и превью чеков на API | Токен [@BotFather](https://t.me/BotFather); значение `change_me` = не задан |
| `BOT_MODE` | нет | `polling` (локально) или `webhook` |
| `TELEGRAM_WEBHOOK_URL` | для webhook | Публичный URL endpoint (сервер приёма в MVP не в репо) |

API использует тот же `TELEGRAM_BOT_TOKEN` для `getFile` при отдаче вложений (`/preview`, `/download`).

### Бот (отладка и AI)

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `AI_PROVIDER` | `yandex` | Primary AI provider для `parseTextIntent` и других completions. Значения: `yandex` (по умолчанию), `qwen`. Неизвестное значение → предупреждение в лог и fallback на `yandex` |
| `AI_PROVIDER_TIMEOUT_MS` | `30000` | Timeout одного HTTP-запроса к LLM (все providers) |
| `AI_PROVIDER_MAX_RETRIES` | `1` | Число **повторов** после неудачной попытки (только transient: timeout, network, 408/429/5xx) |
| `AI_PROVIDER_RETRY_BASE_DELAY_MS` | `500` | Базовая задержка backoff между retry (`500`, `1000`, …) |
| `QWEN_API_KEY` | — | Секретный API-ключ из Yandex Cloud; **обязателен** при `AI_PROVIDER=qwen` и `QWEN_AUTH_TYPE=api-key` |
| `QWEN_BASE_URL` | `https://ai.api.cloud.yandex.net/v1` | OpenAI-compatible endpoint Yandex Cloud AI Studio |
| `QWEN_AUTH_TYPE` | `api-key` | `api-key` (`Authorization: Api-Key`) или `iam-token` (`Bearer`; при отсутствии `QWEN_API_KEY` — `YANDEX_CLOUD_IAM_TOKEN`) |
| `QWEN_MODEL` | — | URI модели, напр. `gpt://<FOLDER_ID>/<QWEN_MODEL_ID>/latest`; folder можно не дублировать, если задан `YANDEX_CLOUD_FOLDER_ID` |
| `BOT_DEV_SELF_CHECKS` | `false` | Self-checks парсеров при старте бота |
| `BOT_AI_CLEANUP_BASIC_TASKS` | `false` | LLM-очистка title для коротких deterministic `create_task` |
| `BOT_YANDEX_PROMPT_LOG_DIR` | `logs/yandex-gpt` | Сохранение промптов при отказе модели / невалидной схеме |
| `TASK_NOTIFICATION_SCHEDULER_ENABLED` | `true` | Scheduler уведомлений по задачам |
| `TASK_NOTIFICATION_INTERVAL_MS` | `60000` | Интервал scheduler (мс) |

### Yandex Cloud (опционально)

| Переменная | Назначение |
|------------|------------|
| `YANDEX_CLOUD_FOLDER_ID` | Каталог; заголовок `x-folder-id` |
| `YANDEX_GPT_API_KEY` | `Authorization: Api-Key` (**приоритет**) |
| `YANDEX_CLOUD_IAM_TOKEN` | `Authorization: Bearer`, если API key пуст |
| `YANDEX_GPT_MODEL_URI` | URI модели; если `change_me` → `gpt://{folder}/yandexgpt/latest` |
| `YANDEX_SPEECHKIT_API_KEY` | Заготовка; голос в боте **не реализован** |

Пустая строка и `change_me` считаются «переменная не задана». Без настроенного AI provider бот отвечает на произвольный текст: использовать slash-команды.

**Qwen (Yandex Cloud):** переменные `QWEN_*` используются только при `AI_PROVIDER=qwen`. Модель и каталог — в формате Yandex (`gpt://…`). При `AI_PROVIDER=yandex` (или если переменная не задана) Qwen не вызывается.

**Retry/timeout:** `AI_PROVIDER_*` применяются к YandexGPT и Qwen. Секреты (API key, Authorization) **не** попадают в логи и `AiProviderError`. Ошибки 401/403/400 не retry-ятся; token usage логируется только после успешного ответа.

Подробнее: [ai-intent.md](ai-intent.md), [bot.md](bot.md#ai-парсер-опционально).

### S3 (заготовки)

| Переменная | Назначение |
|------------|------------|
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Постоянное хранение вложений; MVP — `telegramFileId` |

## Минимальный `.env` для старта

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/neportal
API_URL=http://localhost:4000
NEXT_PUBLIC_API_URL=http://localhost:4000
NEPORTAL_ORG_SLUG=neportal-demo
TELEGRAM_BOT_TOKEN=<ваш токен>
```

Для AI intent добавьте блок Yandex из `.env.example`.

## Отладка env

```bash
# из корня — должен отработать без ошибки DATABASE_URL
pnpm db:studio
```

При старте API/бота в консоли: `Loaded env from: <путь>` — если путь неверный, проверьте `cwd` терминала.
