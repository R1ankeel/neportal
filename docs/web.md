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
- `apiGet`, `apiPostJson`, `apiPatchJson` - серверный `fetch` с `cache: "no-store"`.
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

### Приложение `(app)/` - оболочка `AppShell`

Боковое меню: **Главная**, **Проекты**, **Сотрудники**. Задачи и бюджеты - внутри проекта; заметки и отсутствия org - на отдельных URL (см. ниже).

| Путь | Назначение |
|------|------------|
| `/dashboard` | Главная |
| `/projects` | Список проектов (`actorUserId` в query) |
| `/projects/[id]` | Обзор проекта |
| `/projects/[id]/tasks` | Задачи проекта: название - ссылка на карточку, дедлайн, смена статуса |
| `/projects/[id]/notes` | Legacy-вкладка: редирект на `/notes` (заметки не привязаны к проекту) |
| `/projects/[id]/budgets` | Бюджеты проекта: вкладки «Активные» / «Архивные», создание, архивация, totals, **ключевые слова** (`matchingKeywords`) |
| `/projects/[id]/absences` | Read-only: отсутствия участников проекта и `affectedTasks` по проекту; ссылка на `/absences` |
| `/notes` | **Личные заметки** сотрудника (`GET /notes?actorUserId=…`); селектор актора |
| `/absences` | **Все отсутствия** организации (`GET /absences?actorUserId=…`); селектор актора |
| `/employees` | Сотрудники: список, Telegram username, статус привязки, форма добавления |
| `/tasks` | Глобальный список задач в доступных проектах актора |
| `/tasks/[id]` | Карточка задачи: статус, проект, автор, исполнитель, дедлайн, «В работе с» (`startedAt`), описание, результат/причина отмены, комментарии, форма добавления |
| `/budgets` | Глобальный список бюджетов (подсказка перейти в проект) |
| `/budgets/[id]` | Карточка бюджета: totals, статусы расходов, редактирование **ключевых слов** для бота, загрузка чека для `PENDING_RECEIPT` (если бюджет ACTIVE, `POST .../receipt`), просмотр/скачивание чеков |

Вкладки проекта: `ProjectTabs` - Обзор, Задачи, Заметки (legacy), Бюджеты, Отсутствия.

### Селектор актора (MVP)

Компонент `ActorUserSelector` на страницах с `?actorUserId=` имитирует «текущего пользователя» без логина. По умолчанию выбирается первый OWNER (в сиде - Иван). API требует `actorUserId` для проектов, списка задач, бюджетов и отсутствий - см. [api.md](api.md).

## Сотрудники и Telegram (`/employees`)

- **Список:** ФИО, роль, `@telegramUsername`, статус привязки:
  - `telegramId` задан → **Привязан**
  - `telegramId` нет, `telegramUsername` есть → **Ожидает /start** (сотрудник подтверждает в боте)
  - username не указан → **Username не указан**
- **Добавить сотрудника:** Server Action `POST /users` - ФИО, роль, опционально Telegram username (без `@`).
- **Редактирование username:** inline-форма в строке (пока `telegramId` не привязан) → `PATCH /users/:id`.
- **Отвязка:** «Отвязать Telegram» (если задан `telegramId` или `telegramUsername`) → `DELETE /users/:id/telegram` - сброс обоих полей → **Username не указан**.
- **Удаление:** «Удалить» → `DELETE /users/:id` (soft: `ARCHIVED`, Telegram очищается); последний OWNER удалить нельзя.
- Ошибка 409 при username: «Этот username уже указан у сотрудника {fullName}».

**Нормализация username** (на API, дублируется в формах Web): trim, убрать `@`, lowercase; пустая строка → `null`. Примеры: `@TestUser` → `testuser`, `" vasya "` → `vasya`.

`telegramUsername` - для первой привязки; `telegramId` - для всех действий после привязки. Смена username в Telegram не ломает связь.

Подробнее о потоке в боте → [bot.md](bot.md) (раздел «Привязка Telegram»).

## Карточка задачи и комментарии (`/tasks/[id]`)

- Данные: `GET /tasks/:id` (задача + комментарии по `createdAt` asc).
- Назад: к `/projects/[id]/tasks`, если у задачи есть проект, иначе к `/tasks`.
- При статусе `IN_PROGRESS` и наличии `startedAt` - поле *«В работе с»* (`formatDateTime`).
- Результат (`DONE` + `completionResult`) и причина отмены (`CANCELLED` + `cancellationReason`) - отдельные блоки.
- Смена статуса в списке проекта (`TaskStatusActions`): кнопка «В работе» → `PATCH /tasks/:id/status` с `IN_PROGRESS` (проставляет `startedAt` на API).
- **История передачи** - блок `transfers[]` из `GET /tasks/:id`: дата, инициатор, от кого → кому, статус (`transferStatusLabel`), комментарий, причина отказа для `REJECTED`.
- Комментарии: автор, дата, метка источника (`noteSourceLabel`: Web / Telegram / Голос Telegram). Если у комментария есть `mentions[]` - строка *«Упомянуты: …»* (ФИО приглашённых).
- Добавление: Server Action `POST /tasks/:id/comments`, автор - `findWebAuthor` (`src/lib/webAuthor.ts`): **Иван Иванов** OWNER из сида, иначе первый OWNER.

## Заметки (`/notes`)

- Заметки **личные**, без `projectId` в БД и API.
- Список: `GET /notes?actorUserId=…` (только заметки выбранного актора).
- Редактирование текста: `PATCH /notes/:id` с `actorUserId` в body (Server Action в `components/notes/actions.ts`).
- Вкладка проекта `/projects/[id]/notes` сохранена для совместимости; канонический UI - `/notes`.

## Отсутствия

### Организация (`/absences`)

- Список: `GET /absences?actorUserId=…` (без отменённых по умолчанию).
- Read-only карточки с `affectedTasks` по всей org.

### Проект (`/projects/[id]/absences`)

- Список: `GET /absences?actorUserId=…&projectId=…` (без отменённых).
- На карточке - кнопка **Удалить** (`CancelAbsenceButton`): `window.confirm`, затем Server Action `POST /absences/:id/cancel` с автором `findWebAuthor` (как у комментариев к задаче) и `cancellationReason`: «Удалено через Web».
- После успеха - `revalidatePath` вкладки и обзора проекта.

## Бюджеты и ключевые слова

На странице бюджета (`/budgets/[id]`) можно задать **ключевые слова** (`matchingKeywords`) - строка через запятую (например `реклама, vk, таргет`). Бот использует их в `budget-resolver.ts`, чтобы сопоставить фразу расхода («потратил на рекламу VK») с нужным бюджетом без угадывания по товару.

При создании бюджета в проекте поле «Ключевые слова» опционально. Intent `create_budget` в боте может задать `matchingKeywords` при создании бюджета голосом/текстом.

Для расходов со статусом `PENDING_RECEIPT` на карточке бюджета доступна **загрузка чека** (файл → `POST /budget-expenses/:id/receipt`, хранение в `UPLOAD_DIR` на API).

## Паттерны UI

- **Списки** - серверный рендер + `apiGet`.
- **Формы** (расход, комментарии к задаче) - Server Actions в `actions.ts` рядом со страницей, затем `revalidatePath`.
- **Тёмная тема** - классы `dark:` в Tailwind.

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
