# Веб-приложение (`apps/web`)

Общий контекст и карта репозитория: [developer-guide.md](developer-guide.md).

Next.js 15 с **App Router**, серверные компоненты и Server Actions для мутаций. Стили: **Tailwind CSS**.

## Запуск

```bash
pnpm --filter @neportal/web dev
```

Порт: **3000** (`APP_URL` в `.env`).

Сборка задаёт `NODE_ENV=production` поверх корневого `.env`, чтобы `NODE_ENV=development` из `.env` не ломал `next build`.

## Обращение к API

Модуль: `src/lib/api.ts`

- Базовый URL: `API_URL` или `NEXT_PUBLIC_API_URL` (fallback `http://localhost:4000`).
- `apiGet`, `apiPostJson`, `apiPatchJson` — серверный `fetch` с `cache: "no-store"`.
- Вложения расходов:
  - `getAttachmentPreviewUrl(id)` → inline-просмотр в модальном окне
  - `getAttachmentDownloadUrl(id)` → скачивание файла
  - Для `<img>` / `<iframe>` в браузере нужен `NEXT_PUBLIC_API_URL` (или `API_URL` на SSR).

Типы ответов: `src/lib/types.ts`. Форматирование денег/дат: `src/lib/format.ts`.

## Маршруты

### Публичные

| Путь | Назначение |
|------|------------|
| `/` | Входная страница (редирект в приложение) |

### Приложение `(app)/` — оболочка `AppShell`

Боковое меню: **Главная**, **Проекты**, **Сотрудники**.

| Путь | Назначение |
|------|------------|
| `/dashboard` | Главная |
| `/projects` | Список проектов |
| `/projects/[id]` | Обзор проекта |
| `/projects/[id]/tasks` | Задачи проекта: дедлайн (`deadlineAt` или «—»), смена статуса |
| `/projects/[id]/notes` | Заметки |
| `/projects/[id]/budgets` | Бюджеты проекта |
| `/projects/[id]/absences` | Больничные и отпуска участников проекта, затронутые задачи |
| `/employees` | Сотрудники: список, Telegram username, статус привязки, форма добавления |
| `/tasks` | Глобальный список задач (без пункта в меню) |
| `/budgets` | Глобальный список бюджетов |
| `/budgets/[id]` | Карточка бюджета, расходы, форма добавления, модальный просмотр чеков |

Вкладки проекта: компонент `ProjectTabs` — Обзор, Задачи, Заметки, Бюджеты, Отсутствия.

## Сотрудники и Telegram (`/employees`)

- **Список:** ФИО, роль, `@telegramUsername`, статус привязки:
  - `telegramId` задан → **Привязан**
  - `telegramId` нет, `telegramUsername` есть → **Ожидает /start** (сотрудник подтверждает в боте)
  - username не указан → **Username не указан**
- **Добавить сотрудника:** Server Action `POST /users` — ФИО, роль, опционально Telegram username (без `@`).
- **Редактирование username:** inline-форма в строке (пока `telegramId` не привязан) → `PATCH /users/:id`.
- **Отвязка:** «Отвязать Telegram» (если задан `telegramId` или `telegramUsername`) → `DELETE /users/:id/telegram` — сброс обоих полей → **Username не указан**.
- **Удаление:** «Удалить» → `DELETE /users/:id` (soft: `ARCHIVED`, Telegram очищается); последний OWNER удалить нельзя.
- Ошибка 409 при username: «Этот username уже указан у сотрудника {fullName}».

**Нормализация username** (на API, дублируется в формах Web): trim, убрать `@`, lowercase; пустая строка → `null`. Примеры: `@TestUser` → `testuser`, `" vasya "` → `vasya`.

`telegramUsername` — для первой привязки; `telegramId` — для всех действий после привязки. Смена username в Telegram не ломает связь.

Подробнее о потоке в боте → [bot.md](bot.md) (раздел «Привязка Telegram»).

## Паттерны UI

- **Списки** — серверный рендер + `apiGet`.
- **Формы** (расход, задачи) — Server Actions в `actions.ts` рядом со страницей, затем `revalidatePath`.
- **Тёмная тема** — классы `dark:` в Tailwind.

## Аутентификация

В MVP **нет** страницы входа и сессий. Предполагается демо-организация и открытый API на localhost.

## Связанные файлы

```
apps/web/src/
├── app/(app)/layout.tsx      # AppShell
├── components/AppShell.tsx
├── components/ProjectTabs.tsx
└── app/(app)/budgets/[id]/
    ├── page.tsx
    ├── ExpenseAttachments.tsx  # модальный просмотр и ссылки на download
    ├── AddExpenseForm.tsx
    └── actions.ts
```
