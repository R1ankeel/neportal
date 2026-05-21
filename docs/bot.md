# Telegram-бот (`apps/bot`)

Стек: **grammY**, TypeScript, long polling по умолчанию.

## Настройка

В **корневом** `.env`:

```env
TELEGRAM_BOT_TOKEN=<токен от BotFather>
API_URL=http://localhost:4000
BOT_MODE=polling
```

Для webhook:

```env
BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://your-host/telegram/webhook
```

Запуск (перед `tsx` собирается `@neportal/ai-contracts`):

```bash
pnpm --filter @neportal/bot dev
```

При старте вызывается `loadRootEnv()` из `@neportal/shared` (как в API).

### YandexGPT (опционально)

Для разбора **обычного текста** без slash-команд в **корневом** `.env`:

```env
YANDEX_CLOUD_FOLDER_ID=<folder-id>
# API key (приоритет): Authorization: Api-Key
YANDEX_GPT_API_KEY=<ключ вида y0__...>
# Или IAM token: Authorization: Bearer (если API key не задан)
YANDEX_CLOUD_IAM_TOKEN=
YANDEX_GPT_MODEL_URI=gpt://<folder-id>/yandexgpt/latest
```

| Переменная | Назначение |
|------------|------------|
| `YANDEX_CLOUD_FOLDER_ID` | Каталог Yandex Cloud, заголовок `x-folder-id` |
| `YANDEX_GPT_API_KEY` | Статический ключ; **не** подставлять в `Bearer` |
| `YANDEX_CLOUD_IAM_TOKEN` | IAM-токен; **не** подставлять в `Api-Key` |
| `YANDEX_GPT_MODEL_URI` | URI модели; если `change_me` — `gpt://{folder}/yandexgpt/latest` |

Значения `change_me` и пустые строки считаются «не задано».

Если Yandex не настроен — slash-команды работают; на произвольный текст бот отвечает: *«AI-парсер пока не настроен. Используйте команды /demo.»*

При успешном старте в консоли (без секретов): `[yandex-gpt] auth mode: api-key` или `iam-token`.

Подробнее о контракте JSON → [ai-intent.md](ai-intent.md).

## Команды

| Команда | Действие |
|---------|----------|
| `/start` | Привязка Telegram по username из Web + краткая справка |
| `/me` | Статус привязки (ФИО, роль, @username) |
| `/link <ФИО>` | Привязка по имени (**dev**, без username в Web) |
| `/demo` | Полный список команд |
| `/task <текст>` | `POST /tasks` в проекте по умолчанию |
| `/note <текст>` | `POST /notes`, source `TELEGRAM_TEXT` |
| `/expense <сумма> <описание>` | `POST /budgets/:id/expenses` |
| `/sick до <дата> [номер <№>]` | `POST /absences` (`SICK_LEAVE`) |
| `/vacation с <дата> по <дата>` | `POST /absences` (`VACATION`) |
| `/deadline <название> <дата>` | `PATCH /tasks/:id/deadline` |

### Привязка Telegram (username flow)

Руководитель в Web (`/employees`) создаёт сотрудника и указывает **Telegram username** (`@Vasya` → `vasya` на API). Сотрудник в Telegram отправляет **`/start`**.

**Идентификация:**

| Поле | Когда используется |
|------|-------------------|
| `telegramUsername` | Только **первичная привязка** через `/start` (пока `telegramId` пустой) |
| `telegramId` | **Постоянная** идентификация для slash-команд, AI и расходов после подтверждения |

Смена `@username` в Telegram **не отвязывает** сотрудника — связь держится на `telegramId`.

**Отвязка в Web:** `DELETE /users/:id/telegram` — очищает `telegramId`, **не** трогает `telegramUsername`; сотрудник снова может пройти `/start`.

**Поток `/start`:**

1. `GET /users/by-telegram/:telegramId` — если пользователь уже привязан → *«Здравствуйте, {fullName}. Вы уже привязаны.»*
2. Иначе, если у отправителя есть `ctx.from.username`:
   - `GET /users/by-telegram-username/:username` (без `@`, case-insensitive)
   - Найден, `telegramId` пустой → pending `confirm_link_by_username`, вопрос *да / нет*
   - Найден, `telegramId` уже задан → *«…уже привязан. Обратитесь к руководителю.»*
3. Username не указан в Telegram или сотрудник не найден → *«Попросите руководителя добавить ваш username…»*

**Подтверждение:** ответ `да` → `PATCH /users/:id/telegram` с `telegramId = String(ctx.from.id)` → *«Готово. Telegram привязан…»*; `нет` → *«Привязка отменена.»*

Pending привязки и AI intent хранятся **в памяти** (`pending-intent.ts`), типы различаются полем `type`.

После привязки все действия (задачи, заметки, расходы, отсутствия, AI) используют **linked user** по `telegramId` (`getCurrentUserOrFallback`).

### Dev fallback: `/link <ФИО>`

Для локальной отладки без username в Web: поиск сотрудника по подстроке `fullName` (case-insensitive), затем `PATCH /users/:id/telegram`. Не использовать в проде — позже заменится на invite-code.

### Обычный текст (YandexGPT)

Сообщения **без** `/` в начале (не команда) обрабатываются AI-парсером, если заданы переменные Yandex.

**Поток:**

1. Текст → YandexGPT → JSON intent (см. `@neportal/ai-contracts`).
2. Валидация Zod; `confidence < 0.7` или `intent: unknown` → «Не понял команду…».
3. Сопоставление hints с проектами/пользователями/бюджетами/задачами из API (`intent-resolver.ts`).
4. Preview и вопрос: *«Ответьте: да / нет»*.
5. Ответ `да` / `+` / `yes` (регистр не важен) → выполнение через те же REST-обёртки, что и slash-команды.
6. `нет` / `-` / `no` → отмена; pending сбрасывается.

**Примеры фраз:**

| Текст | Intent |
|-------|--------|
| Поставь Васе задачу подготовить отчет до 23 мая | `create_task` |
| Запиши заметку: клиент попросил завтра проверить статистику VK | `create_note` |
| Потратил 1500 рублей на рекламу VK | `create_expense` |
| Вася заболел до 25 мая, больничный 123456 | `create_absence` |

**Даты в тексте заметок:** в `payload.text` модель может вернуть ISO; бот перед сохранением заменяет `2026-05-22` → `22.05.2026` (`replaceIsoDatesInText`). Поля `deadlineDate` / `startDate` / `endDate` в JSON остаются ISO `YYYY-MM-DD`.

**Сопоставление hints** (`hint-matchers.ts`):

- `projectHint` → проект по подстроке имени (без учёта регистра), иначе проект по умолчанию.
- `assigneeHint` / `userHint` → пользователь по подстроке `fullName`.
- `budgetHint` → бюджет проекта по подстроке `title`, иначе первый бюджет.
- `taskTitle` → точное совпадение `title`, иначе `includes`; несколько совпадений → просьба уточнить.

Pending confirmation хранится **в памяти** процесса (`pending-intent.ts`), как «последний расход».

### Проект и бюджет по умолчанию

Логика в `apps/bot/src/api.ts`:

1. **Проект:** из `GET /projects` предпочитается **«Реклама VK»**, иначе первый в списке.
2. **Бюджет:** из `GET /budgets?projectId=…` предпочитается заголовок, содержащий «Реклама VK», иначе первый.
3. **Автор / расход / отсутствие без явного сотрудника:** пользователь, привязанный по `telegramId` (`getCurrentUserOrFallback`); иначе **Иван** `OWNER`, иначе первый в списке.
4. **Исполнитель задачи:** **Вася** (`EMPLOYEE`), иначе первый `EMPLOYEE` (если не указан `assigneeHint` в AI).

Если проектов или бюджетов нет — бот просит создать их в Web.

### Чеки к расходу

1. Пользователь отправляет `/expense 1500 реклама VK`.
2. Бот создаёт расход и сохраняет «последний расход» в памяти (`last-expense.ts`) по `telegram user id`.
3. Следующее **фото** или **документ** → `POST /budget-expenses/:expenseId/attachments` с `telegramFileId`.

Открытие чека в браузере: через API `GET /budget-expense-attachments/:id/preview`.

### Больничный и отпуск

Обработчики зарегистрированы через **`bot.command("sick")` / `bot.command("vacation")`**, а не `bot.hears`: в grammY сообщения-команды (`/sick …`) по умолчанию **не попадают** в `hears`.

Даты в формате **DD.MM.YYYY** (`apps/bot/src/parse-ru-date.ts` → ISO `YYYY-MM-DD`, например `25.05.2026` → `2026-05-25`).

`createAbsence()` делает `POST ${API_URL}/absences` с телом `{ userId, type, startDate, endDate, documentNumber?, status: "APPROVED" }`.

**Dev-логи** (консоль бота, без токенов): payload команды, выбранный пользователь, тело POST, при ошибке — `status` и body. Отключить: `BOT_DEV_LOG=0`.

| Команда | Примеры | Логика |
|---------|---------|--------|
| `/sick` | `/sick до 25.05.2026 номер 123456`, `/sick 25.05.2026` | `startDate` = сегодня (UTC), `endDate` из команды, `type` = `SICK_LEAVE`, `status` = `APPROVED` |
| `/vacation` | `/vacation с 01.06.2026 по 10.06.2026`, `/vacation 01.06.2026 10.06.2026` | обе даты из команды, `type` = `VACATION` |

Ответы бота:

- больничный: «Больничный добавлен: с … по …. Номер: …»
- отпуск: «Отпуск добавлен: с … по ….»

При неверной дате — подсказка по использованию команды.

Отображение в Web: вкладка **Отсутствия** проекта (`GET /absences?projectId=…`).

### Дедлайн задачи

`bot.command("deadline")` — последняя дата **DD.MM.YYYY** в аргументе, всё до неё — точное название задачи.

| Пример | Действие |
|--------|----------|
| `/deadline Подготовить отчет 22.05.2026` | `GET /tasks?projectId=…` → поиск по `title` → `PATCH /tasks/:id/deadline` |

Ответ: «Дедлайн задачи «…» установлен на …». Ошибки: задача не найдена; несколько совпадений.

Для проверки **affectedTasks**: в сиде есть задача «Подписать договор с подрядчиком» (исполнитель Иван, deadline 22.05.2026) + `/sick до 25.05.2026` для Ивана.

## HTTP-клиент бота

Файл `apps/bot/src/api.ts` — обёртки над REST:

- `fetchUsers`, `fetchUserByTelegramId`, `fetchUserByTelegramUsername`, `linkTelegramUser`
- `fetchProjects`, `fetchBudgets`, `fetchTasks`
- `createTask`, `createNote`, `createBudgetExpense` (alias `createExpense`), `createExpenseAttachment`, `createAbsence`
- `updateTaskDeadline` (alias `setTaskDeadline`)
- `pickAssigneeId`, `pickDefaultProjectId`, `pickDefaultBudget`, `findUserByNameHint`

При ошибке `POST /absences` бот пишет в консоль `status` и body и отвечает пользователю понятным текстом.

## Структура кода (AI и команды)

| Файл | Назначение |
|------|------------|
| `main.ts` | Регистрация команд, фото/документов, `message:text` → `ai-message.ts` |
| `yandex-gpt.ts` | Запрос в YandexGPT, prompt, auth, `extractJsonText`, валидация |
| `ai-contracts.ts` | Загрузка Zod-схемы из `packages/ai-contracts/dist` (обход stale `node_modules`) |
| `ai-message.ts` | Текст без `/`, confirmation, порог confidence |
| `intent-context.ts` | Контекст для prompt: дата, проекты, пользователи, бюджеты, задачи |
| `intent-resolver.ts` | hints → ID сущностей |
| `intent-preview.ts` | Текст «Создать задачу? … Ответьте: да / нет» |
| `intent-executor.ts` | Вызов API после подтверждения |
| `confirmation.ts` | Распознавание да/нет |
| `pending-intent.ts` | In-memory pending: AI intent или привязка по username |
| `start-binding.ts` | Логика `/start` и подтверждение привязки |
| `current-user.ts` | Linked user или fallback для slash/AI |
| `parse-ru-date.ts` | DD.MM.YYYY ↔ ISO, `replaceIsoDatesInText` |

**Dev-логи YandexGPT** (не логируют токены; отключить: `BOT_DEV_LOG=0`):

- `raw AI JSON before validation`
- `validation error` / `parsed intent`

## Troubleshooting

| Симптом | Причина / решение |
|---------|-------------------|
| `/sick` молчит или не создаёт запись | Раньше: `bot.hears` не ловит команды. Сейчас: `bot.command`. Перезапустите `pnpm --filter @neportal/bot dev`. |
| `GET /absences` пустой после `/sick` | Проверьте логи `[bot] POST /absences`, `API_URL` в `.env`, что API запущен на `:4000`. |
| Ошибка 400/404 от API | В логе будет body ответа; проверьте `pnpm db:seed` и `userId`. |
| YandexGPT HTTP 401 `Unknown api key` | IAM-токен передан как `Api-Key`. Используйте `YANDEX_GPT_API_KEY` для `Api-Key`, `YANDEX_CLOUD_IAM_TOKEN` для `Bearer`. |
| Zod: `version` / `action` / `entity` | Устаревший `@neportal/ai-contracts` в `node_modules`. Выполните `pnpm --filter @neportal/ai-contracts build` и перезапустите бота (см. `ai-contracts.ts`). |
| «Не смог разобрать команду» | Невалидный JSON от модели или ошибка схемы; смотрите `[yandex-gpt] validation error`. |
| В заметке дата `2026-05-22` | Перезапустите бота с актуальным кодом (`replaceIsoDatesInText` в `intent-resolver`). |

## Ограничения

- Состояние «последний расход» и **pending AI intent** — **в памяти процесса**; сбрасывается при перезапуске бота.
- YandexGPT **не выполняет** действия — только парсит текст; API вызывает бот после «да».
- Без привязки `telegramId` slash/AI используют fallback (Иван OWNER) — см. `getCurrentUserOrFallback`.
- `/link` — только для dev; в продукте — username в Web + `/start`.
- SpeechKit / голосовые сообщения — не реализованы (env в `.env.example` — заготовка).
- Webhook-режим только выставляет URL; HTTP-сервер для приёма апдейтов нужно поднимать отдельно (не в MVP).
- Деплой в Yandex Cloud для MVP **не требуется** — только внешний API YandexGPT/SpeechKit из локального бота.
