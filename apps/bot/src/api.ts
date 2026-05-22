import { devLog, devLogApiError } from "./dev-log";

/**
 * Базовый URL REST API (тот же, что для apps/web).
 */
export function getApiBaseUrl(): string {
  const raw = process.env.API_URL?.trim() || "http://localhost:4000";
  return raw.replace(/\/$/, "");
}

export type ApiUser = {
  id: string;
  fullName: string;
  role: string;
  telegramId?: string | null;
  telegramUsername?: string | null;
};

/** Нормализация @username (без @, lower case); пусто → null. */
export function normalizeTelegramUsername(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutAt = trimmed.replace(/^@+/, "");
  const lower = withoutAt.toLowerCase();
  return lower.length > 0 ? lower : null;
}

export type UserNameMatchResult =
  | { kind: "none" }
  | { kind: "one"; user: ApiUser }
  | { kind: "many"; users: ApiUser[] };

export type ApiProject = {
  id: string;
  name: string;
};

export type ApiBudget = {
  id: string;
  title: string;
  initialAmount: string | number;
  spentAmount: string | number;
  currency: string;
  project?: { id: string; name: string } | null;
};

export async function fetchUsers(): Promise<ApiUser[]> {
  const res = await fetch(`${getApiBaseUrl()}/users`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /users → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiUser[]>;
}

export async function fetchUserByTelegramId(
  telegramId: string,
): Promise<ApiUser | null> {
  const res = await fetch(
    `${getApiBaseUrl()}/users/by-telegram/${encodeURIComponent(telegramId)}`,
    { headers: { Accept: "application/json" } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET /users/by-telegram/${telegramId} → ${res.status} ${text}`.trim(),
    );
  }
  return res.json() as Promise<ApiUser>;
}

export async function fetchUserByTelegramUsername(
  username: string,
): Promise<ApiUser | null> {
  const normalized = normalizeTelegramUsername(username);
  if (!normalized) return null;
  const res = await fetch(
    `${getApiBaseUrl()}/users/by-telegram-username/${encodeURIComponent(normalized)}`,
    { headers: { Accept: "application/json" } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET /users/by-telegram-username/${normalized} → ${res.status} ${text}`.trim(),
    );
  }
  return res.json() as Promise<ApiUser>;
}

export async function linkTelegramUser(
  userId: string,
  telegramId: string,
): Promise<ApiUser> {
  const res = await fetch(`${getApiBaseUrl()}/users/${userId}/telegram`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ telegramId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `PATCH /users/${userId}/telegram → ${res.status} ${text}`.trim(),
    );
  }
  return res.json() as Promise<ApiUser>;
}

/** Поиск по ФИО для /link: includes, без выбора при неоднозначности. */
export function findUserByNameHint(
  users: ApiUser[],
  hint: string,
): UserNameMatchResult {
  const q = hint.trim().toLowerCase();
  if (!q) return { kind: "none" };

  const matches = users.filter((u) =>
    u.fullName.toLowerCase().includes(q),
  );
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "one", user: matches[0] };
  return { kind: "many", users: matches };
}

export async function fetchProjects(): Promise<ApiProject[]> {
  const res = await fetch(`${getApiBaseUrl()}/projects`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /projects → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiProject[]>;
}

/** Нет проектов → null; иначе предпочтительно «Реклама VK», иначе id первого в списке. */
export function pickDefaultProjectId(projects: ApiProject[]): string | null {
  if (projects.length === 0) return null;
  const preferred = projects.find((p) => p.name === "Реклама VK");
  return preferred?.id ?? projects[0].id;
}

export function pickDefaultProject(projects: ApiProject[]): ApiProject | null {
  if (projects.length === 0) return null;
  const preferred = projects.find((p) => p.name === "Реклама VK");
  return preferred ?? projects[0];
}

export async function fetchBudgets(projectId: string): Promise<ApiBudget[]> {
  const url = new URL(`${getApiBaseUrl()}/budgets`);
  url.searchParams.set("projectId", projectId);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /budgets → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiBudget[]>;
}

/** Нет бюджетов → null; иначе предпочтительно название с «Реклама VK», иначе первый. */
export function pickDefaultBudget(budgets: ApiBudget[]): ApiBudget | null {
  if (budgets.length === 0) return null;
  const preferred = budgets.find((b) => b.title.includes("Реклама VK"));
  return preferred ?? budgets[0];
}

export function parseAmount(value: string | number | undefined | null): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(amount: number, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Alias for AI intent execution. */
export const createExpense = createBudgetExpense;

export async function createBudgetExpense(
  budgetId: string,
  body: {
    userId: string;
    amount: number;
    description?: string;
    source: "WEB" | "TELEGRAM_TEXT" | "TELEGRAM_VOICE";
  },
): Promise<{
  id: string;
  amount: string | number;
  budget: ApiBudget;
}> {
  const res = await fetch(`${getApiBaseUrl()}/budgets/${budgetId}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      userId: body.userId,
      amount: body.amount,
      currency: "RUB",
      description: body.description,
      source: body.source,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /budgets/${budgetId}/expenses → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<{ id: string; amount: string | number; budget: ApiBudget }>;
}

export async function createExpenseAttachment(
  expenseId: string,
  body: {
    telegramFileId: string;
    originalFilename?: string;
    mimeType?: string;
    uploadedById: string;
  },
): Promise<{ id: string }> {
  const res = await fetch(`${getApiBaseUrl()}/budget-expenses/${expenseId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /budget-expenses/${expenseId}/attachments → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<{ id: string }>;
}

export type ApiTask = {
  id: string;
  title: string;
  deadlineAt: string | null;
  status: string;
  creatorId: string;
  assigneeId: string | null;
  creator?: { id: string; fullName: string } | null;
  assignee?: { id: string; fullName: string } | null;
  project?: { id: string; name: string } | null;
};

export type ApiTaskStatusUpdated = ApiTaskCreated;

export type TaskNotificationType =
  | "TASK_ASSIGNED"
  | "TASK_DEADLINE_TOMORROW"
  | "TASK_OVERDUE_ASSIGNEE"
  | "TASK_OVERDUE_CREATOR"
  | "TASK_COMPLETED_CREATOR"
  | "TASK_CANCELLED_CREATOR";

export type ApiTaskUserNotify = {
  id: string;
  fullName: string;
  telegramId: string | null;
};

export type ApiTaskCreated = {
  id: string;
  title: string;
  deadlineAt: string | null;
  creatorId: string;
  assigneeId: string | null;
  creator: ApiTaskUserNotify;
  assignee: ApiTaskUserNotify | null;
  project?: { id: string; name: string } | null;
};

export type DeadlineTomorrowNotificationItem = {
  id: string;
  title: string;
  deadlineAt: string | null;
  project: { id: string; name: string } | null;
  assignee: ApiTaskUserNotify | null;
  creator: ApiTaskUserNotify;
};

export type OverdueNotificationItem = DeadlineTomorrowNotificationItem & {
  notifyAssignee: boolean;
  notifyCreator: boolean;
};

export async function fetchTasks(projectId?: string): Promise<ApiTask[]> {
  const url = new URL(`${getApiBaseUrl()}/tasks`);
  if (projectId) url.searchParams.set("projectId", projectId);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /tasks → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiTask[]>;
}

/** Alias for AI intent execution. */
export const setTaskDeadline = updateTaskDeadline;

export async function updateTaskStatus(
  taskId: string,
  status: "DONE" | "CANCELLED",
): Promise<ApiTaskStatusUpdated> {
  devLog("PATCH /tasks/:id/status payload", { taskId, status });

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    devLogApiError(`PATCH /tasks/${taskId}/status`, res.status, text);
    throw new Error(`Не удалось изменить статус задачи (${res.status}). ${text}`.trim());
  }
  return res.json() as Promise<ApiTaskStatusUpdated>;
}

export async function updateTaskDeadline(
  taskId: string,
  deadlineAt: string | null,
): Promise<ApiTask> {
  const payload = { deadlineAt };
  devLog("PATCH /tasks/:id/deadline payload", { taskId, ...payload });

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}/deadline`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    devLogApiError(`PATCH /tasks/${taskId}/deadline`, res.status, text);
    throw new Error(`Не удалось установить дедлайн (${res.status}). ${text}`.trim());
  }
  return res.json() as Promise<ApiTask>;
}

export async function createTask(body: {
  title: string;
  description?: string;
  creatorId: string;
  assigneeId?: string;
  projectId?: string;
  deadlineAt?: string;
}): Promise<ApiTaskCreated> {
  devLog("POST /tasks payload", body as Record<string, unknown>);

  const res = await fetch(`${getApiBaseUrl()}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /tasks → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiTaskCreated>;
}

export async function fetchDeadlineTomorrowNotifications(): Promise<
  DeadlineTomorrowNotificationItem[]
> {
  const res = await fetch(`${getApiBaseUrl()}/tasks/notifications/deadline-tomorrow`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET /tasks/notifications/deadline-tomorrow → ${res.status} ${text}`.trim(),
    );
  }
  return res.json() as Promise<DeadlineTomorrowNotificationItem[]>;
}

export async function fetchOverdueNotifications(): Promise<OverdueNotificationItem[]> {
  const res = await fetch(`${getApiBaseUrl()}/tasks/notifications/overdue`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /tasks/notifications/overdue → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<OverdueNotificationItem[]>;
}

export async function recordTaskNotification(
  taskId: string,
  userId: string,
  type: TaskNotificationType,
): Promise<{ id: string }> {
  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userId, type }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /tasks/${taskId}/notifications → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<{ id: string }>;
}

export async function createNote(body: {
  text: string;
  creatorId: string;
  projectId?: string;
  source?: "WEB" | "TELEGRAM_TEXT" | "TELEGRAM_VOICE";
}): Promise<{ id: string; text: string; project?: { id: string; name: string } | null }> {
  const res = await fetch(`${getApiBaseUrl()}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /notes → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<{ id: string; text: string; project?: { id: string; name: string } | null }>;
}

/** Иван (OWNER) — автор в сиде; иначе первый OWNER / первый пользователь. */
export function pickCreatorId(users: ApiUser[]): string | undefined {
  const ivan = users.find((u) => u.fullName.includes("Иван") && u.role === "OWNER");
  if (ivan) return ivan.id;
  const owner = users.find((u) => u.role === "OWNER");
  return owner?.id ?? users[0]?.id;
}

/** Сотрудник для отсутствия: Иван Иванов OWNER, иначе первый пользователь в списке. */
export function pickAbsenceUserId(users: ApiUser[]): { id: string; fullName: string } | undefined {
  const ivan = users.find((u) => u.fullName === "Иван Иванов" && u.role === "OWNER");
  const user = ivan ?? users[0];
  return user ? { id: user.id, fullName: user.fullName } : undefined;
}

/** Вася (EMPLOYEE) — исполнитель в сиде; иначе первый EMPLOYEE. */
export function pickAssigneeId(users: ApiUser[]): string | undefined {
  const vasya = users.find((u) => u.fullName.includes("Вася"));
  if (vasya) return vasya.id;
  return users.find((u) => u.role === "EMPLOYEE")?.id;
}

export type ApiAbsence = {
  id: string;
  type: "SICK_LEAVE" | "VACATION";
  status: string;
  startDate: string;
  endDate: string;
  documentNumber: string | null;
  user: { id: string; fullName: string; role: string };
};

export async function createAbsence(body: {
  userId: string;
  type: "SICK_LEAVE" | "VACATION";
  startDate: string;
  endDate: string;
  documentNumber?: string;
  status?: "APPROVED";
}): Promise<ApiAbsence> {
  const payload = {
    userId: body.userId,
    type: body.type,
    startDate: body.startDate,
    endDate: body.endDate,
    ...(body.documentNumber != null ? { documentNumber: body.documentNumber } : {}),
    status: body.status ?? "APPROVED",
  };

  devLog("POST /absences payload", payload as Record<string, unknown>);

  const res = await fetch(`${getApiBaseUrl()}/absences`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    devLogApiError("POST /absences", res.status, text);
    throw new Error(`Не удалось создать отсутствие (${res.status}). ${text}`.trim());
  }
  return res.json() as Promise<ApiAbsence>;
}

export async function fetchAbsences(projectId: string): Promise<ApiAbsence[]> {
  const url = new URL(`${getApiBaseUrl()}/absences`);
  url.searchParams.set("projectId", projectId);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /absences → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiAbsence[]>;
}
