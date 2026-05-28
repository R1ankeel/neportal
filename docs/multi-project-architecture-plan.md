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
- Демо-эвристика “**Реклама VK**” как default project/budget в боте **убрана** (Stage 6A); в seed/docs имя может оставаться как демо-данные.
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

## Bot project UX (реализовано в Stage 6A–6B)

Было: `pickDefaultProjectId()` / `pickDefaultProject()` / `pickDefaultBudget()` и silent fallback на «Реклама VK» — **удалено**.

Логика:
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

### Этап 6A — Bot project selection для create flows ✅ (реализован)
- **Цель**: выбор проекта для create_task / create_budget / create_expense, slash `/task` и `/expense`; без production fallback на «Реклама VK»; note/absence без выбора проекта.
- **Модули**: `project-resolution.ts`, `project-selection-flow.ts`, `pending-project-selection.ts`, `continue-after-project-selection.ts`, create/slash flows.
- **Проверки**: 1 проект → auto-select; 2+ → кнопки; strict `projectHint`; smoke create flows.

### Этап 6B — Bot project UX continuation ✅ (реализован)
- **Цель**: списки задач и edit project в confirmation без лишнего выбора проекта.
- **Списки** (`my-tasks-flow.ts`, `/tasks`, `list_my_tasks`, `list_user_tasks`):
  - без `projectHint`: все доступные проекты, группировка `Проект: …`, α-порядок, нумерация с 1 в секции, лимит 20, footer при ровно 20 задачах;
  - с `projectHint`: strict resolve, одна секция `Проект: X`.
- **Task actions** без `projectHint`: без выбора проекта (регрессия: `resolve-task-by-title.ts` → `GET /tasks` без `projectId`).
- **Confirmation edit**: поле «Проект» для `create_task` / `create_expense` — кнопочный выбор или strict текст; `actorUserId` = linked user; cancel project selection → «Ок, изменение проекта отменено.» без зависшего pending; `create_expense` после смены проекта → budget selection через `reconfirmAfterEdit`.
- **Не делали**: completed tasks, поле «Проект» для `create_budget`, API/Web/Prisma.

### Этап 7 — Mention membership + add-to-project flow ✅ (реализован, Bot-only policy)
- **Цель**: mentions только внутри проекта задачи + add-to-project override для MANAGER/OWNER.
- **Scope (что сделано)**:
  - **Bot-only**: `gateMentionProjectMembership` перед preview/execute; pending `mention_add:yes|no`; add через существующий `POST /projects/:id/members` (`ProjectRole.MEMBER`).
  - **API/Web не менялись**: `POST /tasks/:id/comments/mention` по-прежнему не проверяет `ProjectMember` — Web может mention без membership до отдельного этапа.
  - `addProjectMember` в боте — **только** mention add-to-project flow (не общий Telegram ProjectMember management).
- **Поведение**:
  - mentioned user уже в проекте → обычный mention-flow;
  - не в проекте + EMPLOYEE/ACCOUNTANT → `{Имя} не добавлен в проект «{Проект}».` без кнопок;
  - не в проекте + OWNER или MANAGER (сам member проекта) → вопрос + «Добавить в проект» / «Отмена» → add → продолжение с той же точки (preview / execute / awaiting text);
  - после add: re-fetch задачи (`fetchTaskById`), idempotent duplicate member, re-check перед comment.
- **Smoke**: `apps/bot/scripts/smoke-stage7-mention-membership.mts` (live API + mock ctx).
- **Follow-up (отдельные будущие этапы, не Stage 7)**:
  1. **API-level mention membership enforcement (Web + Bot)** — проверка `ProjectMember` в `POST /tasks/:id/comments/mention` (и при необходимости согласованные read/check endpoints), единая политика для Web и Telegram; отдельный этап после стабилизации Bot-only flow.
  2. **UX: ACCOUNTANT / actor без доступа к проекту задачи** — сейчас gate может получить `GET /projects/:id/members → 404` и показать «Ошибка API…» вместо дружелюбного «не добавлен в проект» / «нет доступа к проекту»; улучшить обработку в bot (и позже в API), без изменения общей project-selection UX.

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

### Этап 10A — Prisma hardening: Task/Budget.projectId required ✅ (реализован)
- **Цель**: зафиксировать инварианты схемы: задачи и бюджеты всегда в проекте.
- **Модули/файлы**:
  - `packages/database/prisma/schema.prisma`
  - migration `20260528185916_task_budget_project_id_required`
  - типы API/Bot/Web (Task/Budget `project` non-null)
  - `project-access.service.ts` (guards)
- **Изменения**:
  - `Task.projectId`, `Budget.projectId` — `NOT NULL`
  - FK `ON DELETE RESTRICT` (не Cascade)
  - Preflight: `pnpm projectId:nulls` перед migrate
- **Не входит в 10A**: `Note.projectId` drop (→ **10B**), deprecated DTO (→ **10C**)
- **Проверки**: см. `reports/stage10-prisma-hardening-cleanup.md`
- **Готовность**: schema + migration применены; create без projectId по-прежнему 400 на API

### Этап 10B — Note.projectId drop (следующий PR)
- Preflight: `SELECT COUNT(*) FROM "Note" WHERE "projectId" IS NOT NULL` → `reports/stage10b-note-project-cleanup.md`
- Drop column + relations; API/Web cleanup

### Этап 10C — Deprecated DTO removal (после аудита клиентов)
- `createdById`, `creatorId` и прочие legacy body fields

