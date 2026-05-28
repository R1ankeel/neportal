# Multi-project architecture plan (Neportal)

Документ фиксирует **обновлённый** безопасный план перехода Neportal от “одного демо-проекта” к полноценной архитектуре **нескольких проектов внутри организации**.

Ограничения этого PR:
- Только документация.
- **Не менять** Prisma schema.
- **Не создавать** миграции.
- **Не менять** API / Bot / Web-логику.

## Принятые продуктовые решения (зафиксировать как инварианты)

### Проекты
- **Проекты создаются только через Web.**
- **Создание проектов доступно только OWNER.**
- Telegram **не создаёт**, **не редактирует**, **не архивирует** проекты и **не управляет** списком проектов.
- Telegram **только использует доступные пользователю проекты** в сценариях задач/комментариев/mentions/бюджетов/расходов.

### Видимость проектов
- **OWNER** видит **все** проекты организации.
- **MANAGER / ACCOUNTANT / EMPLOYEE** видят **только** проекты, где они есть в `ProjectMember`.

### Доступ к проекту
- `ProjectMember` на первом этапе означает **факт доступа к проекту** (membership = access).
- `ProjectRole` на первом этапе **не усложняем**. Если роль уже есть в Prisma — используем минимально, но не строим сложную RBAC-модель вокруг неё.

### Задачи и бюджеты
- Глобальные задачи без проекта **не нужны**.
- Бюджеты **всегда** внутри проекта.
- `Task.projectId` и `Budget.projectId` переводим через **soft baseline**:
  1) backfill старых данных;
  2) запрет создания без `projectId` на уровне API;
  3) только после стабилизации делаем поля `required` в Prisma.

### Notes (заметки)
Notes делаем ранним **privacy/global-user fix**:
- заметки **личные**;
- только автор может читать/редактировать;
- заметки **не требуют проекта** и не относятся к проекту;
- Telegram-команда/сценарий “Записать заметку” **не спрашивает проект**;
- Web-раздел заметок — **глобальный личный** раздел пользователя.

### Absences (отсутствия)
- Отсутствия **глобальные** на уровне пользователя внутри организации.
- Absences остаются **отдельным этапом** после задач/проектов/mentions/бюджетов.
- `affectedTasks` нужно **группировать по проектам**.

### Доступ и проверки
- `ProjectAccessService` должен быть **единой точкой проверок доступа**.
  Не размазывать проверки inline по сервисам: сервисы домена вызывают `ProjectAccessService` (или зависят от него), а не реализуют каждую проверку по-своему.

### AI (YandexGPT)
- AI **только извлекает**: `projectHint`, `userHint`, `taskHint`, `budgetHint`, `date(s)`, `comment`, `title/description`.
- **Код принимает бизнес-решения** и обязан проверять:
  `organizationId`, доступ к проекту, membership, `BudgetAccess`, неоднозначность/ambiguity, валидность ID/дат.

## Текущая реальность (коротко, для контекста)

- В БД уже есть `Project` и `ProjectMember`, а в API/Web уже существуют `/projects/*` и project-scoped страницы.
- В боте и частично в документации присутствует демо-эвристика “**Реклама VK**” (как preferred default project/budget). Её нужно удалить при внедрении project UX.
- В MVP нет полноценной auth; чтобы внедрять проверки доступа постепенно, потребуется вводить `actorUserId` в критичные API-вызовы.

## Целевая модель (в двух словах)

- Проекты — primary scope для задач/комментариев/mentions/бюджетов/расходов.
- Notes и Absences — глобальные (user-level) сущности.
- Видимость проектов — строго через `ProjectMember` (для non-OWNER).
- Telegram работает **только** с проектами, доступными пользователю, и никогда не “угадывает” проект по демо-названию.

## MVP-actor модель (пока нет auth)

Пока нет сессий/JWT, вводим явный **`actorUserId`** в API, чтобы:
- контролировать видимость проектов и доступ к project-scoped данным;
- сделать поведение проверяемым;
- подготовиться к будущему guard-слою без переписывания доменной логики.

Принцип: **всё, что зависит от роли/доступа/приватности, должно знать, кто актор**.

## Где убирать fallback “Реклама VK” (точки изменений на этапе Bot UX)

Эвристика “Реклама VK” должна быть убрана (после появления project selection UX), минимум в:
- `apps/bot/src/api.ts`: `pickDefaultProjectId()` / `pickDefaultProject()` / `pickDefaultBudget()`
- `apps/bot/src/hint-matchers.ts`: `findProjectByHint()` (нельзя silently fallback)
- slash handlers в `apps/bot/src/main.ts`: `/task`, `/note`, расходы/бюджеты (нельзя молча выбирать демо-проект)

Новая логика:
- **1 доступный проект** → auto-select, но **preview всегда показывает проект**.
- **>1 доступный проект** и проект не указан → **кнопочный выбор**.
- `projectHint` указан → резолв **только среди доступных проектов**; если не найден или нет доступа → понятная ошибка.

## AI intents: minimal projectHint (контракты)

Минимальный шаг — расширить intent payloads `projectHint?` там, где действие проектное или где проект влияет на resolution:
- `create_task`
- `add_task_comment`
- `mention_in_task`
- `transfer_task` / `reassign_task`
- `set_task_deadline` / `start_task` / `complete_task` / `cancel_task`
- `list_my_tasks` / `list_user_tasks` (если пользователь просит задачи по конкретному проекту)
- `create_budget`
- `create_expense`

При этом **projectHint никогда не является “решением”**: это лишь подсказка. Любой резолв должен учитывать доступ и неоднозначность.

## Поэтапный план внедрения (обновлённый порядок 0–10)

Ниже порядок этапов **как договорённый план внедрения**. В каждом этапе:
- цель;
- какие модули/файлы затронуть;
- какие изменения внести;
- какие проверки выполнить;
- риски;
- критерии готовности.

### Этап 0 — Документация плана
- **Цель**: зафиксировать архитектурные решения и порядок внедрения.
- **Модули/файлы**: `docs/multi-project-architecture-plan.md`.
- **Изменения**: документирование.
- **Проверки**: ревью продукта/техлида.
- **Риски**: расхождение ожиданий.
- **Готовность**: документ принят.

### Этап 1 — Data baseline soft
- **Цель**: убрать “глобальные” tasks/budgets без проекта без ломания Prisma сразу.
- **Модули/файлы**:
  - `packages/database/prisma/seed.ts`
  - `packages/database/scripts/*` (backfill + checks)
  - API: `apps/api/src/tasks/*`, `apps/api/src/budgets/*` (запрет создания без projectId)
- **Изменения**:
  - backfill `Task.projectId` и `Budget.projectId` для старых данных
  - запрет `POST /tasks` и `POST /budgets` без `projectId`
  - Prisma schema на этом этапе **не ужесточаем** (nullable остаётся nullable)
- **Проверки**:
  - на БД: нет задач/бюджетов без `projectId` после backfill
  - на API: попытка создать без `projectId` → ошибка
  - в боте **не удаляем** fallback “Реклама VK” на этом этапе (максимум `TODO(stage6)`)
- **Риски**:
  - неочевидный target project для legacy данных
- **Готовность**:
  - данные выровнены, новые записи без projectId невозможны на уровне API

### Этап 2 — Notes privacy/global-user
- **Цель**: сделать заметки личными и глобальными.
- **Модули/файлы**:
  - API: `apps/api/src/notes/*`
  - Bot: note flow (`/note`, `create_note`)
  - Web: глобальный раздел заметок
- **Изменения**:
  - notes не требуют `projectId`
  - доступ: только автор
  - `actorUserId` обязателен для notes endpoints (MVP без JWT)
  - Web: `/notes?actorUserId=...` + селектор пользователя (query param)
  - Project-tab “Заметки” остаётся как legacy alias (без project filter, с баннером)
- **Проверки**:
  - чтение/редактирование чужой заметки невозможно
  - чужая заметка возвращает 404 (не 403)
- **Риски**:
  - миграция/обработка старых notes, которые были привязаны к проектам
- **Готовность**:
  - приватность notes соблюдена, UX не зависит от проектов

### Этап 3 — ProjectAccessService + actorUserId + фильтрация проектов ✅ (реализован)
- **Цель**: централизовать доступ и включить actor-based фильтрацию.
- **Модули/файлы**:
  - API: `apps/api/src/projects/project-access.service.ts`, `projects/*`
  - интеграция в `tasks`, `budgets`, `budget-expenses`, `absences` (project views)
  - Web: `/projects?actorUserId=...`, project tabs сохраняют query, `ProjectPageShell`
  - Bot: `fetchProjects` / `fetchTasks` / `fetchBudgets` / `fetchPendingExpenses` с `actorUserId`
- **Изменения**:
  - `ProjectAccessService`: OWNER → все ACTIVE проекты org; иначе → ACTIVE + `ProjectMember`
  - 404 (не 403) при отсутствии доступа / не найден
  - `actorUserId` обязателен на read: `GET /projects`, `GET /projects/:id`, summary, tasks, budgets, budget detail/expenses list, `/budget-expenses/pending`
  - Absences: при `projectId` в query — `actorUserId` обязателен, project gate
  - `/budget-expenses/pending`: OWNER — чужие pending по всем ACTIVE; MANAGER — только по shared projects; свои — в accessible ACTIVE projects
  - BudgetAccess на Stage 3 не переписывали
- **Проверки** (ручные): два пользователя, разные ProjectMember → списки и 404 на cross-access
- **Риски**:
  - MVP без auth → важно единообразно передавать actorUserId из Web/Bot
- **Готовность**:
  - доступ централизован, базовая видимость проектов работает

### Этап 4 — API/Web для создания проектов и ProjectMember ✅ (реализован)
- **Цель**: Web-флоу: OWNER создаёт проект; управление участниками.
- **API**:
  - `POST /projects?actorUserId=` — только OWNER; `createdById = actor`; транзакция + `ProjectMember(MANAGER)` для создателя; legacy `createdById` в body ≠ actor → 400
  - `GET/POST/DELETE /projects/:id/members` — list/add (idempotent 200 + `alreadyMember`) / remove
  - PATCH/archive проекта — **не в Stage 4**
- **Права members**: OWNER — все ACTIVE; MANAGER — только где member (add/remove с ограничениями на delete); ACCOUNTANT/EMPLOYEE — read only
- **MANAGER delete**: нельзя self, org-OWNER, `createdById`, последнего member
- **Web**: `CreateProjectForm` (OWNER), вкладка «Участники», `ProjectMembersPanel`
- **Не делали**: backfill старых проектов без members; Bot/AI/Notes/Absences

### Этап 5 — AI contracts minimal projectHint ✅ (реализован)
- **Цель**: научить AI возвращать `projectHint` в проектных intent’ах.
- **Контракты** (`packages/ai-contracts`): `projectHint?` в create/task/budget/expense intents; убран из `create_note`; preprocess strip legacy `projectHint` для note.
- **Промпты**: `PROJECT_HINT_RULES` в shared-rules; примеры в task/create prompts; список «Проекты» в context для task-status/collaboration/task-list/expense/create-task.
- **Резолв** (`resolveProjectFromHint`): при непустом hint — strict (0 / 2+ → ошибка с перечислением); при пустом — `pickDefaultProject` + `TODO(stage6)`.
- **Task search**: `resolveTaskByTitle` с `projectHint` → `GET /tasks?projectId=`.
- **Списки задач**: `list_my_tasks` / `list_user_tasks` фильтруют по project после strict resolve.
- **Не делали**: completed tasks filter, deterministic parser, project selection UX, Web/API/Prisma.

### Этап 6 — Bot project UX
- **Цель**: проектный UX в Telegram: выбор проекта, удаление fallback “Реклама VK”, “Мои задачи” по проектам.
- **Модули/файлы**:
  - `apps/bot/src/api.ts`, `apps/bot/src/hint-matchers.ts`, `apps/bot/src/route-parsed-intent.ts`, `apps/bot/src/my-tasks-flow.ts`, `apps/bot/src/main.ts`
- **Изменения**:
  - убрать демо-эвристику “Реклама VK”
  - внедрить выбор проекта кнопками
  - “Мои задачи” → группировка по проектам
- **Проверки**:
  - 1 доступный проект → auto-select с preview
  - несколько проектов → кнопочный выбор
  - projectHint не найден/нет доступа → ошибка
- **Риски**:
  - регрессии pending/choice/confirmation
- **Готовность**:
  - Telegram работает только с доступными проектами

### Этап 7 — Mention membership + add-to-project flow
- **Цель**: mentions только внутри проекта задачи + add-to-project override для MANAGER/OWNER.
- **Модули/файлы**:
  - API: mention endpoint + ProjectMember add
  - Bot: mention flows
- **Изменения**:
  - если mentioned user не в проекте:
    - EMPLOYEE → ошибка
    - MANAGER/OWNER → prompt “добавить?”; “Да” → добавить и продолжить
- **Проверки**:
  - нельзя добавить user из другой org
- **Риски**:
  - необходимость re-check “безопасно и однозначно продолжить”
- **Готовность**:
  - mention policy соблюдается

### Этап 8 — Budgets/expenses project UX
- **Цель**: проектный UX для бюджетов и расходов (Telegram + Web).
- **Модули/файлы**:
  - API: budgets/expenses + BudgetAccess
  - Bot: create_expense/create_budget flows
  - Web: project budgets/expenses UX
- **Изменения**:
  - бюджет/расход всегда внутри проекта
  - UX выбора проекта/бюджета учитывает доступ и BudgetAccess
- **Проверки**:
  - расход нельзя добавить в проект/бюджет без доступа
- **Риски**:
  - сложность UX при неоднозначности
- **Готовность**:
  - расходы корректно привязаны к проектам и доступам

### Этап 9 — Absences global + affected tasks grouped by projects
- **Цель**: глобальные отсутствия с impacted/affected задачами, сгруппированными по проектам.
- **Модули/файлы**:
  - API: absences + affected tasks
  - Bot: absence-impact-flow
  - Web: глобальный раздел отсутствий + проектный read-only view
- **Изменения**:
  - affected tasks считаются по всем проектам membership пользователя
  - группировка по проектам в Telegram
- **Проверки**:
  - “я заболел” → impacted задачи сгруппированы по проектам
- **Риски**:
  - производительность
- **Готовность**:
  - absence корректно “опускается” в проекты

### Этап 10 — Prisma hardening: Task.projectId/Budget.projectId required
- **Цель**: финально зафиксировать инварианты схемы после стабилизации.
- **Модули/файлы**:
  - `packages/database/prisma/schema.prisma`
  - миграции
- **Изменения**:
  - сделать `Task.projectId` и `Budget.projectId` required
- **Проверки**:
  - миграции применяются; нет null-значений
- **Риски**:
  - всё ещё могут оставаться legacy null
- **Готовность**:
  - schema enforced на уровне БД/ORM

