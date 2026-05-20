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

Запуск:

```bash
pnpm --filter @neportal/bot dev
```

При старте вызывается `loadRootEnv()` из `@neportal/shared` (как в API).

## Команды

| Команда | Действие |
|---------|----------|
| `/start` | Приветствие и краткая справка |
| `/demo` | Полный список команд |
| `/task <текст>` | `POST /tasks` в проекте по умолчанию |
| `/note <текст>` | `POST /notes`, source `TELEGRAM_TEXT` |
| `/expense <сумма> <описание>` | `POST /budgets/:id/expenses` |
| `/sick до <дата> [номер <№>]` | `POST /absences` (`SICK_LEAVE`) |
| `/vacation с <дата> по <дата>` | `POST /absences` (`VACATION`) |

### Проект и бюджет по умолчанию

Логика в `apps/bot/src/api.ts`:

1. **Проект:** из `GET /projects` предпочитается **«Реклама VK»**, иначе первый в списке.
2. **Бюджет:** из `GET /budgets?projectId=…` предпочитается заголовок, содержащий «Реклама VK», иначе первый.
3. **Автор расхода / создатель задачи:** **Иван** (`OWNER`), иначе первый OWNER, иначе первый пользователь (`pickCreatorId`).
4. **Сотрудник отсутствия** (`/sick`, `/vacation`): **Иван Иванов** `OWNER`, иначе первый пользователь в `GET /users` (`pickAbsenceUserId`).
5. **Исполнитель задачи:** **Вася** (`EMPLOYEE`), иначе первый `EMPLOYEE`.

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

## HTTP-клиент бота

Файл `apps/bot/src/api.ts` — обёртки над REST:

- `fetchUsers`, `fetchProjects`, `fetchBudgets`
- `createTask`, `createNote`, `createBudgetExpense`, `createExpenseAttachment`, `createAbsence`, `fetchAbsences`
- `pickCreatorId`, `pickAbsenceUserId`, `pickAssigneeId`, `pickDefaultProjectId`, `pickDefaultBudget`

При ошибке `POST /absences` бот пишет в консоль `status` и body и отвечает пользователю понятным текстом.

## Troubleshooting

| Симптом | Причина / решение |
|---------|-------------------|
| `/sick` молчит или не создаёт запись | Раньше: `bot.hears` не ловит команды. Сейчас: `bot.command`. Перезапустите `pnpm --filter @neportal/bot dev`. |
| `GET /absences` пустой после `/sick` | Проверьте логи `[bot] POST /absences`, `API_URL` в `.env`, что API запущен на `:4000`. |
| Ошибка 400/404 от API | В логе будет body ответа; проверьте `pnpm db:seed` и `userId`. |

## Ограничения

- Состояние «последний расход» **в памяти процесса** — сбрасывается при перезапуске бота.
- Нет привязки Telegram `from.id` к `User.telegramId` в БД — используются демо-пользователи из сида.
- Webhook-режим только выставляет URL; HTTP-сервер для приёма апдейтов нужно поднимать отдельно (не в MVP).
