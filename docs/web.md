# Веб-приложение (`apps/web`)

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
- Вложения: `getAttachmentOpenUrl(attachmentId)` → `GET /budget-expense-attachments/:id/open`.

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
| `/projects/[id]/tasks` | Задачи проекта, смена статуса |
| `/projects/[id]/notes` | Заметки |
| `/projects/[id]/budgets` | Бюджеты проекта |
| `/projects/[id]/absences` | Отсутствия (заготовка UI) |
| `/employees` | Сотрудники организации |
| `/tasks` | Глобальный список задач (без пункта в меню) |
| `/budgets` | Глобальный список бюджетов |
| `/budgets/[id]` | Карточка бюджета, расходы, форма добавления |

Вкладки проекта: компонент `ProjectTabs` — Обзор, Задачи, Заметки, Бюджеты, Отсутствия.

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
    ├── AddExpenseForm.tsx
    └── actions.ts
```
