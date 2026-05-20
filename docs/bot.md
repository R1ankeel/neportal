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
3. **Автор расхода / создатель задачи / сотрудник отсутствия:** пользователь с именем **Иван** и ролью `OWNER`, иначе первый OWNER, иначе первый пользователь.
4. **Исполнитель задачи:** **Вася** (`EMPLOYEE`), иначе первый `EMPLOYEE`.

Если проектов или бюджетов нет — бот просит создать их в Web.

### Чеки к расходу

1. Пользователь отправляет `/expense 1500 реклама VK`.
2. Бот создаёт расход и сохраняет «последний расход» в памяти (`last-expense.ts`) по `telegram user id`.
3. Следующее **фото** или **документ** → `POST /budget-expenses/:expenseId/attachments` с `telegramFileId`.

Открытие чека в браузере: через API `GET /budget-expense-attachments/:id/preview`.

### Больничный и отпуск

Даты в формате **DD.MM.YYYY** (`apps/bot/src/parse-ru-date.ts` → ISO `YYYY-MM-DD`).

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
- `pickCreatorId`, `pickAssigneeId`, `pickDefaultProjectId`, `pickDefaultBudget`

Ошибки API пробрасываются в ответ пользователю (`Ошибка API: …`).

## Ограничения

- Состояние «последний расход» **в памяти процесса** — сбрасывается при перезапуске бота.
- Нет привязки Telegram `from.id` к `User.telegramId` в БД — используются демо-пользователи из сида.
- Webhook-режим только выставляет URL; HTTP-сервер для приёма апдейтов нужно поднимать отдельно (не в MVP).
