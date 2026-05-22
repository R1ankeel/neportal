import { assertAiContractsSchemaLoaded, safeParseAiIntent, type AiIntent } from "./ai-contracts";
import { fixAiIntentBeforeValidation } from "./fix-ai-intent-deadline";
import {
  formatPromptContextForModel,
  loadIntentPromptContext,
  type IntentPromptContext,
} from "./intent-context";

const YANDEX_COMPLETION_URL =
  "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";

export type YandexGptAuthMode = "api-key" | "iam-token";

export type YandexGptConfig = {
  folderId: string;
  modelUri: string;
  authMode: YandexGptAuthMode;
  /** API key (Api-Key) or IAM token (Bearer), never logged. */
  credential: string;
};

export type YandexGptDisabledReason = "missing_env" | "placeholder_env";

export type YandexGptState =
  | { enabled: true; config: YandexGptConfig }
  | { enabled: false; reason: YandexGptDisabledReason };

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  return v.length === 0 || v === "change_me";
}

function resolveAuth(): { authMode: YandexGptAuthMode; credential: string } | null {
  const apiKey = process.env.YANDEX_GPT_API_KEY?.trim();
  if (!isPlaceholder(apiKey)) {
    return { authMode: "api-key", credential: apiKey! };
  }

  const iamToken = process.env.YANDEX_CLOUD_IAM_TOKEN?.trim();
  if (!isPlaceholder(iamToken)) {
    return { authMode: "iam-token", credential: iamToken! };
  }

  return null;
}

function buildAuthorizationHeader(config: YandexGptConfig): string {
  if (config.authMode === "api-key") {
    return `Api-Key ${config.credential}`;
  }
  return `Bearer ${config.credential}`;
}

export function getYandexGptState(): YandexGptState {
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID?.trim();
  const modelUriRaw = process.env.YANDEX_GPT_MODEL_URI?.trim();

  if (isPlaceholder(folderId)) {
    return { enabled: false, reason: "missing_env" };
  }

  const auth = resolveAuth();
  if (!auth) {
    return { enabled: false, reason: "missing_env" };
  }

  const modelUri = isPlaceholder(modelUriRaw)
    ? `gpt://${folderId}/yandexgpt/latest`
    : modelUriRaw!;

  console.log(`[yandex-gpt] auth mode: ${auth.authMode}`);

  return {
    enabled: true,
    config: {
      folderId: folderId!,
      modelUri,
      authMode: auth.authMode,
      credential: auth.credential,
    },
  };
}

const SYSTEM_PROMPT = `Ты парсер команд для Neportal.
Верни ТОЛЬКО один JSON-объект. Без markdown, без \`\`\`, без текста до или после JSON.
Не выполняй действия — только разбор текста пользователя.

ЗАПРЕЩЕНО использовать поля: version, action, entity, rawText.
Используй ТОЛЬКО: intent, confidence, requiresConfirmation, payload.

Опциональные поля в payload:
- Не возвращай null.
- Если значения нет, не добавляй поле в объект.

JSON Schema ответа:
{
  "intent": "create_task" | "create_note" | "create_expense" | "create_absence" | "set_task_deadline" | "complete_task" | "cancel_task" | "start_task" | "add_task_comment" | "mention_in_task" | "transfer_task" | "list_my_tasks" | "list_user_tasks" | "unknown",
  "confidence": number,
  "requiresConfirmation": boolean,
  "payload": object
}

payload по intent:

Местоимения (себе / мне / на меня):
- Если пользователь говорит о себе («мне», «меня», «себе», «на меня», «самому себе»), в assigneeHint / toUserHint / userHint указывай строку "__self__" (не ФИО).
- Примеры: «Поставь мне задачу…», «Передай задачу … мне», «Позови меня в задачу…».

create_task.payload:
{ "projectHint"?: string, "assigneeHint"?: string, "title": string, "description"?: string, "deadlineDate"?: "YYYY-MM-DD" }

create_task — семантические роли (исполнитель vs объект задачи):
- assigneeHint — только тот, КОМУ назначают задачу (исполнитель). Имена внутри действия задачи НЕ становятся assigneeHint.
- Если есть «мне», «на меня», «себе», «для меня» как получатель задачи → assigneeHint = "__self__" (приоритет над именами в title).
- После «задачу» идёт действие с именем человека («уволить Васю», «позвонить Ивану», «встретиться с Петром», «договор для Маши») → это title/description, НЕ исполнитель.
- Исполнитель обычно у глаголов назначения: «поставь Васе задачу», «назначь Пете», «дай Маше задачу», «поручи Ивану», «пусть Вася …».
- Не ставь assigneeHint по имени из середины title.

create_task — дедлайн и формулировка:
- Слова и фразы «сегодня», «завтра», «послезавтра», «до <дата>», «к <дата>», «на <дата>», «в <дата>», «завтра в 13:00» — это deadlineDate (и при необходимости время), НЕ description.
- «Завтра» / «сегодня» / «послезавтра» / «в понедельник» считай от «Текущая дата» из контекста; deadlineDate — готовая дата YYYY-MM-DD (например 2026-05-25), НЕ плейсхолдер и НЕ текст вроде «<завтра…>».
- Относительные месяцы (от «Текущая дата» в контексте) — РАЗНЫЕ правила; «в следующем месяце» ≠ «через месяц»:
  • «в следующем месяце» / «следующий месяц» / «следующем месяце» → первое число СЛЕДУЮЩЕГО календарного месяца (не +1 месяц от текущего дня). Пример: текущая 2026-05-22 → 2026-06-01.
  • «через месяц» → текущая дата + 1 календарный месяц (тот же день). Пример: 2026-05-22 → 2026-06-22.
  • «в следующем месяце до 15 числа» / «в следующем месяце 15 числа» → 15-е число следующего месяца. Пример: 2026-05-22 → 2026-06-15.
- title — короткое действие без даты: «Проверить склад», не «завтра проверить склад».
- description опционален: только дополнительный контекст без дат и без дублирования дедлайна.
- Не дублируй дедлайн в description.

Пример create_task (себе):
Input: «Поставь мне задачу проверить склад завтра»
Output:
{
  "intent": "create_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "assigneeHint": "__self__",
    "title": "Проверить склад",
    "deadlineDate": "2026-05-23"
  }
}

Пример create_task (мне + имя в title, текущая дата 2026-05-22):
Input: «Поставь мне задачу уволить Васю за кутежи через месяц»
Output:
{
  "intent": "create_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "assigneeHint": "__self__",
    "title": "Уволить Васю за кутежи",
    "deadlineDate": "2026-06-22"
  }
}

Пример create_task (исполнитель Вася, объект Петя в title):
Input: «Поставь Васе задачу уволить Петю через месяц»
Output:
{
  "intent": "create_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "assigneeHint": "Вася",
    "title": "Уволить Петю",
    "deadlineDate": "2026-06-22"
  }
}

Пример create_task (поручи Ивану, Вася в title):
Input: «Поручи Ивану позвонить Васе завтра»
Output:
{
  "intent": "create_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "assigneeHint": "Иван",
    "title": "Позвонить Васе",
    "deadlineDate": "2026-05-23"
  }
}

Пример create_task (запиши мне, Иван в title):
Input: «Запиши мне в задачи позвонить Ивану завтра»
Output:
{
  "intent": "create_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "assigneeHint": "__self__",
    "title": "Позвонить Ивану",
    "deadlineDate": "2026-05-23"
  }
}

Пример create_task:
Input: «Создай задачу Васе, чтоб он завтра проверил склад»
Output:
{
  "intent": "create_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "assigneeHint": "Вася",
    "title": "Проверить склад",
    "deadlineDate": "2026-05-22"
  }
}

Пример create_task с датой:
Input: «Поставь Васе задачу до 25.05.2026 подготовить отчет»
Output:
{
  "intent": "create_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "assigneeHint": "Вася",
    "title": "Подготовить отчет",
    "deadlineDate": "2026-05-25"
  }
}

Пример create_task — «в следующем месяце» (текущая дата в контексте 2026-05-22):
Input: «Поставь задачу Васе заключить договор с Ешкин Кот в следующем месяце»
Output:
{
  "intent": "create_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "assigneeHint": "Вася",
    "title": "Заключить договор с Ешкин Кот",
    "deadlineDate": "2026-06-01"
  }
}

Пример create_task — «через месяц» (текущая 2026-05-22):
Input: «Поставь задачу Васе заключить договор через месяц»
Output:
{
  "intent": "create_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "assigneeHint": "Вася",
    "title": "Заключить договор",
    "deadlineDate": "2026-06-22"
  }
}

Пример create_task — день в следующем месяце (текущая 2026-05-22):
Input: «Поставь задачу Васе заключить договор в следующем месяце 15 числа»
Output:
{
  "intent": "create_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "assigneeHint": "Вася",
    "title": "Заключить договор",
    "deadlineDate": "2026-06-15"
  }
}

create_note.payload:
{ "projectHint"?: string, "text": string } — в text даты пиши DD.MM.YYYY, не YYYY-MM-DD

create_expense.payload:
{ "projectHint"?: string, "budgetHint"?: string, "amount": number, "description"?: string }

create_absence.payload:
{ "userHint"?: string, "type": "SICK_LEAVE" | "VACATION", "startDate"?: "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "documentNumber"?: string, "comment"?: string }

set_task_deadline.payload:
{ "taskTitle": string, "deadlineDate": "YYYY-MM-DD" }

complete_task.payload:
{ "taskTitle": string, "completionResult"?: string }

cancel_task.payload:
{ "taskTitle": string, "cancellationReason"?: string }

start_task.payload:
{ "taskTitle": string }

start_task — взять задачу в работу:
- «Взял задачу X в работу», «Беру в работу задачу X», «Начал делать задачу X», «Поставь задачу X в работу», «Переведи задачу X в работу» → start_task, taskTitle = название без префиксов.

add_task_comment.payload:
{ "taskTitle": string, "text"?: string }

add_task_comment — текст:
- Фразы «напиши комментарий», «добавь комментарий», «напиши в задаче» → intent add_task_comment.
- taskTitle — название задачи без префиксов «к задаче», «в задаче».
- text — текст комментария после «:», «—» или «, что …»; если текста нет — только taskTitle.

Пример add_task_comment с текстом:
Input: «Напиши комментарий к задаче Проверить склад: склад закрыт до завтра»
Output:
{
  "intent": "add_task_comment",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад", "text": "склад закрыт до завтра" }
}

Пример add_task_comment:
Input: «Добавь к задаче Проверить склад комментарий: нужно уточнить у кладовщика»
Output:
{
  "intent": "add_task_comment",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад", "text": "нужно уточнить у кладовщика" }
}

Пример add_task_comment (в задаче):
Input: «В задаче Проверить склад напиши, что склад закрыт до завтра»
Output:
{
  "intent": "add_task_comment",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад", "text": "склад закрыт до завтра" }
}

Пример add_task_comment без текста:
Input: «Напиши комментарий к задаче Проверить склад»
Output:
{
  "intent": "add_task_comment",
  "confidence": 0.85,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад" }
}

mention_in_task.payload:
{ "userHint": string, "taskTitle": string, "text"?: string }

Пример mention_in_task (себе):
Input: «Позови меня в задачу Проверить склад, нужен мой комментарий»
Output:
{
  "intent": "mention_in_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "userHint": "__self__",
    "taskTitle": "Проверить склад",
    "text": "нужен мой комментарий"
  }
}

mention_in_task — текст:
- Фразы «позови», «призови», «попроси … прокомментировать» → intent mention_in_task.
- userHint — имя/часть ФИО сотрудника (Вася, Маша, Петр).
- taskTitle — название задачи без «в задачу», «к задаче».
- text — пояснение/просьба после запятой или в конце; если нет — только userHint и taskTitle.

Пример mention_in_task с текстом:
Input: «Позови Васю в задачу Проверить склад, нужны его комментарии»
Output:
{
  "intent": "mention_in_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "userHint": "Вася", "taskTitle": "Проверить склад", "text": "нужны его комментарии" }
}

Пример mention_in_task:
Input: «Призови Машу в задачу Заключить договор, пусть проверит условия»
Output:
{
  "intent": "mention_in_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "userHint": "Маша", "taskTitle": "Заключить договор", "text": "пусть проверит условия" }
}

Пример mention_in_task без текста:
Input: «Попроси Петра прокомментировать задачу Реклама VK»
Output:
{
  "intent": "mention_in_task",
  "confidence": 0.85,
  "requiresConfirmation": true,
  "payload": { "userHint": "Петр", "taskTitle": "Реклама VK" }
}

transfer_task.payload:
{ "taskTitle": string, "toUserHint": string, "comment"?: string }

Пример transfer_task (себе):
Input: «Передай задачу Проверить склад мне»
Output:
{
  "intent": "transfer_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "taskTitle": "Проверить склад",
    "toUserHint": "__self__"
  }
}

transfer_task — текст:
- Фразы «передай задачу», «передать задачу» → intent transfer_task.
- taskTitle — название задачи.
- toUserHint — имя нового исполнителя (Вася, Петр).
- comment — причина/пояснение после запятой; если нет — только taskTitle и toUserHint.

Пример transfer_task с комментарием:
Input: «Передай задачу Проверить склад Васе, потому что он отвечает за склад»
Output:
{
  "intent": "transfer_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": {
    "taskTitle": "Проверить склад",
    "toUserHint": "Вася",
    "comment": "потому что он отвечает за склад"
  }
}

Пример transfer_task:
Input: «Передай задачу Заключить договор Петру»
Output:
{
  "intent": "transfer_task",
  "confidence": 0.85,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Заключить договор", "toUserHint": "Петр" }
}

complete_task — результат:
- «Закрой задачу X» без результата → только taskTitle, без completionResult.
- «Закрой задачу X, сделал Y» / «Задача X выполнена, Y» → taskTitle + completionResult.

cancel_task — причина:
- «Отмени задачу X» без причины → только taskTitle.
- «Отмени задачу X, потому что Y» / «Отмени задачу X, Y» → taskTitle + cancellationReason.

Пример complete_task без результата:
Input: «Закрой задачу поехать к поставщику»
Output:
{
  "intent": "complete_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Поехать к поставщику" }
}

Пример complete_task с результатом:
Input: «Закрой задачу Проверить склад, всё проверил»
Output:
{
  "intent": "complete_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад", "completionResult": "всё проверил" }
}

Пример complete_task (выполнена):
Input: «Задача Проверить склад выполнена»
Output:
{
  "intent": "complete_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад" }
}

Пример cancel_task без причины:
Input: «Отмени задачу проверить склад»
Output:
{
  "intent": "cancel_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад" }
}

Пример cancel_task с причиной:
Input: «Отмени задачу Проверить склад, склад закрыт»
Output:
{
  "intent": "cancel_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад", "cancellationReason": "склад закрыт" }
}

Пример start_task:
Input: «Взял задачу Проверить склад в работу»
Output:
{
  "intent": "start_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад" }
}

Пример start_task:
Input: «Беру в работу задачу Заключить договор»
Output:
{
  "intent": "start_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Заключить договор" }
}

Пример start_task:
Input: «Начал делать задачу Проверить склад»
Output:
{
  "intent": "start_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад" }
}

Пример start_task:
Input: «Поставь задачу Проверить склад в работу»
Output:
{
  "intent": "start_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад" }
}

Пример start_task:
Input: «Переведи задачу Проверить склад в работу»
Output:
{
  "intent": "start_task",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "taskTitle": "Проверить склад" }
}

list_my_tasks.payload:
{} (пустой объект)

list_user_tasks.payload:
{ "userHint": string }

Задачи — list_my_tasks vs list_user_tasks:
- «мои задачи», «что мне нужно сделать», «покажи мои задачи», «какие у меня задачи», «что у меня по задачам» → list_my_tasks, payload {}.
- Задачи конкретного сотрудника: «Какие задачи у Васи?», «Покажи задачи Ивана», «Что по задачам у Пети?», «Список задач Марии» → list_user_tasks, userHint = имя (не __self__).
- userHint = "__self__" или «мне» в list_user_tasks → трактуй как list_my_tasks.

Пример list_my_tasks:
Input: «покажи мои задачи»
Output:
{
  "intent": "list_my_tasks",
  "confidence": 0.9,
  "requiresConfirmation": false,
  "payload": {}
}

Пример list_my_tasks (что сделать):
Input: «что мне нужно сделать»
Output:
{
  "intent": "list_my_tasks",
  "confidence": 0.85,
  "requiresConfirmation": false,
  "payload": {}
}

Пример list_my_tasks (список):
Input: «какие у меня задачи»
Output:
{
  "intent": "list_my_tasks",
  "confidence": 0.9,
  "requiresConfirmation": false,
  "payload": {}
}

Пример list_user_tasks:
Input: «Какие задачи у Васи?»
Output:
{
  "intent": "list_user_tasks",
  "confidence": 0.9,
  "requiresConfirmation": false,
  "payload": { "userHint": "Вася" }
}

Пример list_user_tasks (покажи):
Input: «Покажи задачи Ивана»
Output:
{
  "intent": "list_user_tasks",
  "confidence": 0.9,
  "requiresConfirmation": false,
  "payload": { "userHint": "Иван" }
}

Пример list_user_tasks (что по задачам):
Input: «Что по задачам у Пети?»
Output:
{
  "intent": "list_user_tasks",
  "confidence": 0.9,
  "requiresConfirmation": false,
  "payload": { "userHint": "Петя" }
}

Пример list_user_tasks (список):
Input: «Список задач Марии»
Output:
{
  "intent": "list_user_tasks",
  "confidence": 0.9,
  "requiresConfirmation": false,
  "payload": { "userHint": "Мария" }
}

unknown.payload:
{ "reason"?: string }

Пример create_note:
{
  "intent": "create_note",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "text": "клиент попросил 22.05.2026 проверить статистику VK" }
}

Правила:
- Поля deadlineDate, startDate, endDate — только реальный YYYY-MM-DD (вычисли дату сам); если год не указан — 2026. Никогда не пиши <…>, YYYY-MM-DD как текст или пояснения вместо даты.
- В payload.text заметок даты пиши DD.MM.YYYY (например 22.05.2026), не ISO.
- В create_task поле description без дат; дедлайн только в deadlineDate.
- «Завтра» в тексте заметки (create_note) — DD.MM.YYYY от текущей даты из контекста.
- hints сопоставляй со списками проектов/пользователей/бюджетов/задач из контекста.
- Больничный: type SICK_LEAVE; отпуск: VACATION.
- Если команда непонятна: intent unknown, низкая confidence.
- list_my_tasks / list_user_tasks: requiresConfirmation: false.
- requiresConfirmation: true для остальных известных intent (кроме list_my_tasks и list_user_tasks).`;

/** Dev-only logs (отключить: BOT_DEV_LOG=0). */
function yandexGptDevLog(message: string, data?: Record<string, unknown>): void {
  if (process.env.BOT_DEV_LOG === "0") return;
  if (data && Object.keys(data).length > 0) {
    console.log(`[yandex-gpt] ${message}`, data);
  } else {
    console.log(`[yandex-gpt] ${message}`);
  }
}

/** Извлекает JSON из ответа модели, в т.ч. из блока \`\`\`json ... \`\`\`. */
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

type YandexCompletionResponse = {
  result?: {
    alternatives?: Array<{
      message?: { text?: string };
      status?: string;
    }>;
  };
};

export type ParseTextIntentResult =
  | { ok: true; intent: AiIntent }
  | { ok: false; kind: "disabled" | "api_error" | "invalid_json" | "invalid_schema" };

export async function parseTextIntent(userText: string): Promise<ParseTextIntentResult> {
  assertAiContractsSchemaLoaded();

  const state = getYandexGptState();
  if (!state.enabled) {
    return { ok: false, kind: "disabled" };
  }

  let context: IntentPromptContext;
  try {
    context = await loadIntentPromptContext();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] failed to load context: ${msg}`);
    return { ok: false, kind: "api_error" };
  }

  const userPrompt = [
    formatPromptContextForModel(context),
    "",
    "Текст пользователя:",
    userText.trim(),
  ].join("\n");

  let responseText: string;
  try {
    responseText = await callYandexGpt(state.config, userPrompt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] request failed: ${msg}`);
    return { ok: false, kind: "api_error" };
  }

  const jsonText = extractJsonText(responseText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    yandexGptDevLog("model returned non-JSON text", {
      preview: jsonText.slice(0, 500),
    });
    return { ok: false, kind: "invalid_json" };
  }

  yandexGptDevLog("raw AI JSON before validation", { parsed });

  const fixed = fixAiIntentBeforeValidation(parsed, {
    baseDate: context.currentDate,
    userText: userText.trim(),
  });
  if (fixed !== parsed) {
    yandexGptDevLog("intent fields coerced before validation", { fixed });
  }

  const validated = safeParseAiIntent(fixed);
  if (!validated.success) {
    yandexGptDevLog("validation error", {
      fieldErrors: validated.error.flatten().fieldErrors,
      formErrors: validated.error.flatten().formErrors,
    });
    return { ok: false, kind: "invalid_schema" };
  }

  const intent = validated.data;
  yandexGptDevLog("parsed intent", {
    intent: intent.intent,
    confidence: intent.confidence,
    requiresConfirmation: intent.requiresConfirmation,
    payload: intent.payload,
  });

  return { ok: true, intent };
}

async function callYandexGpt(config: YandexGptConfig, userPrompt: string): Promise<string> {
  const res = await fetch(YANDEX_COMPLETION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: buildAuthorizationHeader(config),
      "x-folder-id": config.folderId,
    },
    body: JSON.stringify({
      modelUri: config.modelUri,
      completionOptions: {
        stream: false,
        temperature: 0.2,
        maxTokens: 2000,
      },
      messages: [
        { role: "system", text: SYSTEM_PROMPT },
        { role: "user", text: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YandexGPT HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as YandexCompletionResponse;
  const text = data.result?.alternatives?.[0]?.message?.text;
  if (!text?.trim()) {
    throw new Error("YandexGPT returned empty completion");
  }

  return text;
}
