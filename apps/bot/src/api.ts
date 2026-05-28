import { devLog, devLogApiError } from "./dev-log";
import { resolveUsersByHint } from "./resolve-users-by-hint";

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
  systemAliases?: string | null;
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

export type ApiBudgetTotals = {
  amount: number;
  confirmedSpent: number;
  pendingSpent: number;
  totalSpent: number;
  confirmedRemaining: number;
  projectedRemaining: number;
  spent: number;
};

export type ApiBudget = {
  id: string;
  title: string;
  initialAmount: string | number;
  spentAmount: string | number;
  currency: string;
  status: string;
  requiresReceipt: boolean;
  matchingKeywords?: string | null;
  project?: { id: string; name: string } | null;
  totals?: ApiBudgetTotals;
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

/** Поиск сотрудника по подсказке (без currentUser — без self-hints). */
export function findUserByNameHint(
  users: ApiUser[],
  hint: string,
  currentUser?: ApiUser | null,
): UserNameMatchResult {
  return resolveUsersByHint(users, hint, currentUser ?? null);
}

export function pickDefaultActorUserId(users: ApiUser[]): string | null {
  return users.find((u) => u.role === "OWNER")?.id ?? users[0]?.id ?? null;
}

export async function fetchProjects(actorUserId: string): Promise<ApiProject[]> {
  const url = new URL(`${getApiBaseUrl()}/projects`);
  url.searchParams.set("actorUserId", actorUserId);
  const res = await fetch(url.toString(), {
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

export async function fetchBudgets(
  projectId: string,
  actorUserId: string,
  userId?: string,
): Promise<ApiBudget[]> {
  const url = new URL(`${getApiBaseUrl()}/budgets`);
  url.searchParams.set("actorUserId", actorUserId);
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("status", "ACTIVE");
  if (userId) url.searchParams.set("userId", userId);
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

export async function createBudget(body: {
  projectId: string;
  name: string;
  amount: number;
  createdById: string;
  requiresReceipt?: boolean;
  matchingKeywords?: string;
  currency?: string;
}): Promise<ApiBudget> {
  const res = await fetch(`${getApiBaseUrl()}/budgets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      projectId: body.projectId,
      name: body.name,
      amount: body.amount,
      currency: body.currency ?? "RUB",
      createdById: body.createdById,
      requiresReceipt: body.requiresReceipt ?? false,
      matchingKeywords: body.matchingKeywords,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /budgets → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiBudget>;
}

/** Alias for AI intent execution. */
export const createExpense = createBudgetExpense;

export async function createBudgetExpense(
  budgetId: string,
  body: {
    userId: string;
    actorUserId?: string;
    amount: number;
    description?: string;
    source: "WEB" | "TELEGRAM_TEXT" | "TELEGRAM_VOICE";
    hasReceipt?: boolean;
  },
): Promise<{
  id: string;
  amount: string | number;
  status: string;
  budget: ApiBudget;
}> {
  const res = await fetch(`${getApiBaseUrl()}/budgets/${budgetId}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      userId: body.userId,
      actorUserId: body.actorUserId ?? body.userId,
      amount: body.amount,
      currency: "RUB",
      description: body.description,
      source: body.source,
      hasReceipt: body.hasReceipt ?? false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /budgets/${budgetId}/expenses → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<{
    id: string;
    amount: string | number;
    status: string;
    budget: ApiBudget;
  }>;
}

export function budgetRemaining(budget: ApiBudget): number {
  if (budget.totals) return budget.totals.projectedRemaining;
  return parseAmount(budget.initialAmount) - parseAmount(budget.spentAmount);
}

export function budgetTotalsOrFallback(budget: ApiBudget): ApiBudgetTotals {
  if (budget.totals) return budget.totals;
  const amount = parseAmount(budget.initialAmount);
  const confirmedSpent = parseAmount(budget.spentAmount);
  return {
    amount,
    confirmedSpent,
    pendingSpent: 0,
    totalSpent: confirmedSpent,
    confirmedRemaining: amount - confirmedSpent,
    projectedRemaining: amount - confirmedSpent,
    spent: confirmedSpent,
  };
}

export type ApiPendingExpense = {
  id: string;
  amount: string | number;
  description: string | null;
  status: string;
  createdAt: string;
  budget: {
    id: string;
    name: string;
    status: string;
    requiresReceipt: boolean;
    project: { id: string; name: string } | null;
  };
};

export async function fetchPendingExpenses(
  actorUserId: string,
  userId: string,
  limit = 10,
): Promise<ApiPendingExpense[]> {
  const url = new URL(`${getApiBaseUrl()}/budget-expenses/pending`);
  url.searchParams.set("actorUserId", actorUserId);
  url.searchParams.set("userId", userId);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /budget-expenses/pending → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiPendingExpense[]>;
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

/** Alias: прикрепить чек Telegram к существующему расходу. */
export const attachReceiptToExpense = createExpenseAttachment;

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

/** Задача с полями карточки (GET /tasks/:id). */
export type ApiTaskDetail = ApiTask & {
  description?: string | null;
  completionResult?: string | null;
  cancellationReason?: string | null;
  completedAt?: string | null;
};

export type ApiMyTask = ApiTask & {
  completedAt?: string | null;
  completionResult?: string | null;
};

export type ApiTaskStatusUpdated = ApiTaskCreated;

export type TaskNotificationType =
  | "TASK_ASSIGNED"
  | "TASK_DEADLINE_TOMORROW"
  | "TASK_OVERDUE_ASSIGNEE"
  | "TASK_OVERDUE_CREATOR"
  | "TASK_COMPLETED_CREATOR"
  | "TASK_CANCELLED_CREATOR"
  | "TASK_STARTED_CREATOR";

export type ApiTaskUserNotify = {
  id: string;
  fullName: string;
  telegramId: string | null;
};

export type ApiTaskCreated = {
  id: string;
  title: string;
  deadlineAt: string | null;
  startedAt?: string | null;
  completionResult?: string | null;
  cancellationReason?: string | null;
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

export async function fetchTasks(actorUserId: string, projectId?: string): Promise<ApiTask[]> {
  const url = new URL(`${getApiBaseUrl()}/tasks`);
  url.searchParams.set("actorUserId", actorUserId);
  if (projectId) url.searchParams.set("projectId", projectId);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /tasks → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiTask[]>;
}

export async function fetchTaskById(
  taskId: string,
  actorUserId: string,
): Promise<ApiTaskDetail | null> {
  const url = new URL(`${getApiBaseUrl()}/tasks/${encodeURIComponent(taskId)}`);
  url.searchParams.set("actorUserId", actorUserId);
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /tasks/${taskId} → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiTaskDetail>;
}

export async function fetchMyTasks(userId: string, limit = 5): Promise<ApiMyTask[]> {
  const url = new URL(`${getApiBaseUrl()}/tasks/my`);
  url.searchParams.set("userId", userId);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /tasks/my → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiMyTask[]>;
}

export async function fetchCompletedTasks(userId: string, limit = 5): Promise<ApiMyTask[]> {
  const url = new URL(`${getApiBaseUrl()}/tasks/completed`);
  url.searchParams.set("userId", userId);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /tasks/completed → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiMyTask[]>;
}

/** Alias for AI intent execution. */
export const setTaskDeadline = updateTaskDeadline;

export async function updateTaskStatus(
  taskId: string,
  status: "DONE" | "CANCELLED" | "IN_PROGRESS",
  options?: { completionResult?: string; cancellationReason?: string },
): Promise<ApiTaskStatusUpdated> {
  const body: Record<string, string> = { status };
  if (options?.completionResult?.trim()) {
    body.completionResult = options.completionResult.trim();
  }
  if (options?.cancellationReason?.trim()) {
    body.cancellationReason = options.cancellationReason.trim();
  }
  devLog("PATCH /tasks/:id/status payload", { taskId, ...body });

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
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

export type ApiTaskCommentCreated = {
  id: string;
  text: string;
  source: string;
  createdAt: string;
  author: { id: string; fullName: string; role: string };
};

export type ApiTaskCommentMention = {
  id: string;
  mentionedUser: { id: string; fullName: string; role: string };
};

export type ApiTaskComment = {
  id: string;
  text: string;
  source: string;
  createdAt: string;
  author: { id: string; fullName: string; role: string };
  mentions?: ApiTaskCommentMention[];
};

export async function fetchTaskComments(taskId: string): Promise<ApiTaskComment[]> {
  const res = await fetch(`${getApiBaseUrl()}/tasks/${encodeURIComponent(taskId)}/comments`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /tasks/${taskId}/comments → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiTaskComment[]>;
}

export async function createTaskComment(
  taskId: string,
  body: {
    authorId: string;
    text: string;
    source?: "WEB" | "TELEGRAM_TEXT" | "TELEGRAM_VOICE";
  },
): Promise<ApiTaskCommentCreated> {
  devLog("POST /tasks/:id/comments payload", { taskId, ...body });

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    devLogApiError(`POST /tasks/${taskId}/comments`, res.status, text);
    throw new Error(`Не удалось добавить комментарий (${res.status}). ${text}`.trim());
  }
  return res.json() as Promise<ApiTaskCommentCreated>;
}

export type ApiTaskCommentMentionCreated = {
  comment: ApiTaskCommentCreated & {
    mentions?: Array<{
      id: string;
      mentionedUser: { id: string; fullName: string; role: string };
    }>;
  };
  mention: {
    id: string;
    mentionedUser: { id: string; fullName: string; role: string };
  };
  task: ApiTask;
  mentionedUser: { id: string; fullName: string; role: string; telegramId: string | null };
  author: { id: string; fullName: string; role: string; telegramId: string | null };
};

export async function createTaskCommentMention(
  taskId: string,
  body: {
    authorId: string;
    mentionedUserId: string;
    text: string;
    source?: "WEB" | "TELEGRAM_TEXT" | "TELEGRAM_VOICE";
  },
): Promise<ApiTaskCommentMentionCreated> {
  devLog("POST /tasks/:id/comments/mention payload", { taskId, ...body });

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}/comments/mention`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    devLogApiError(`POST /tasks/${taskId}/comments/mention`, res.status, text);
    throw new Error(`Не удалось пригласить в задачу (${res.status}). ${text}`.trim());
  }
  return res.json() as Promise<ApiTaskCommentMentionCreated>;
}

export type ApiTaskTransferUser = {
  id: string;
  fullName: string;
  role: string;
};

export type ApiTaskTransfer = {
  id: string;
  taskId: string;
  fromUserId: string;
  toUserId: string;
  requestedById: string;
  absenceId: string | null;
  comment: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  fromUser: ApiTaskTransferUser;
  toUser: ApiTaskTransferUser;
  requestedBy: ApiTaskTransferUser;
};

export type ApiTaskTransferResult = {
  transfer: ApiTaskTransfer;
  task: ApiTask;
};

export async function createTaskTransfer(
  taskId: string,
  body: { requestedById: string; toUserId: string; comment?: string; absenceId?: string },
): Promise<ApiTaskTransferResult> {
  devLog("POST /tasks/:id/transfers payload", { taskId, ...body });

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    devLogApiError(`POST /tasks/${taskId}/transfers`, res.status, text);
    throw new Error(`Не удалось передать задачу (${res.status}). ${text}`.trim());
  }
  return res.json() as Promise<ApiTaskTransferResult>;
}

export async function acceptTaskTransfer(
  transferId: string,
  body: { userId: string },
): Promise<ApiTaskTransferResult> {
  const res = await fetch(`${getApiBaseUrl()}/task-transfers/${transferId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Не удалось принять передачу (${res.status}). ${text}`.trim());
  }
  return res.json() as Promise<ApiTaskTransferResult>;
}

export async function rejectTaskTransfer(
  transferId: string,
  body: { userId: string; rejectionReason: string },
): Promise<ApiTaskTransferResult> {
  const res = await fetch(`${getApiBaseUrl()}/task-transfers/${transferId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Не удалось отклонить передачу (${res.status}). ${text}`.trim());
  }
  return res.json() as Promise<ApiTaskTransferResult>;
}

export async function createNote(body: {
  actorUserId: string;
  text: string;
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

export type ApiAbsenceAffectedTask = {
  id: string;
  title: string;
  status: string;
  deadlineAt: string | null;
  project: { id: string; name: string } | null;
  creator: { id: string; fullName: string; telegramId: string | null };
  assignee: { id: string; fullName: string; telegramId: string | null } | null;
};

export type ApiAbsence = {
  id: string;
  type: "SICK_LEAVE" | "VACATION";
  status: string;
  startDate: string;
  endDate: string;
  documentNumber: string | null;
  comment?: string | null;
  user: { id: string; fullName: string; role: string };
  affectedTasks?: ApiAbsenceAffectedTask[];
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

export async function fetchAbsenceAffectedTasks(
  absenceId: string,
): Promise<ApiAbsenceAffectedTask[]> {
  const res = await fetch(`${getApiBaseUrl()}/absences/${absenceId}/affected-tasks`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /absences/${absenceId}/affected-tasks → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiAbsenceAffectedTask[]>;
}

export type AbsenceNotificationType =
  | "ABSENCE_AFFECTED_TASKS_EMPLOYEE"
  | "ABSENCE_AFFECTED_TASK_CREATOR"
  | "ABSENCE_TASK_DELEGATED_CREATOR";

export async function recordAbsenceNotification(
  absenceId: string,
  body: { taskId: string; userId: string; type: AbsenceNotificationType },
): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/absences/${absenceId}/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /absences/${absenceId}/notifications → ${res.status} ${text}`.trim());
  }
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

export async function fetchAbsencesByUserId(userId: string): Promise<ApiAbsence[]> {
  const url = new URL(`${getApiBaseUrl()}/absences`);
  url.searchParams.set("userId", userId);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /absences → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<ApiAbsence[]>;
}

export async function cancelAbsence(
  absenceId: string,
  body: { cancelledById: string; cancellationReason?: string },
): Promise<ApiAbsence> {
  const payload = {
    cancelledById: body.cancelledById,
    ...(body.cancellationReason != null ? { cancellationReason: body.cancellationReason } : {}),
  };

  devLog("POST /absences/:id/cancel payload", { absenceId, ...payload });

  const res = await fetch(`${getApiBaseUrl()}/absences/${absenceId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    devLogApiError(`POST /absences/${absenceId}/cancel`, res.status, text);
    if (res.status === 403) {
      throw new Error("Вы не можете удалить это отсутствие.");
    }
    if (res.status === 409) {
      throw new Error("Отсутствие уже удалено.");
    }
    throw new Error(`Не удалось отменить отсутствие (${res.status}). ${text}`.trim());
  }
  return res.json() as Promise<ApiAbsence>;
}

// ---------------------------------------------------------------------------
// Notification message bindings (reply-to-notification flow)
// ---------------------------------------------------------------------------

export type NotificationBindingType =
  | "NEW_TASK"
  | "TASK_TRANSFER"
  | "TASK_COMMENT"
  | "TASK_MENTION";

export type ApiNotificationBinding = {
  id: string;
  telegramChatId: string;
  telegramMessageId: number;
  organizationId: string;
  taskId: string;
  sourceCommentId: string | null;
  sourceCommentAuthorId: string | null;
  notificationType: NotificationBindingType;
};

export async function createNotificationBinding(data: {
  telegramChatId: string;
  telegramMessageId: number;
  taskId: string;
  sourceCommentId?: string | null;
  sourceCommentAuthorId?: string | null;
  notificationType: NotificationBindingType;
}): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/notification-bindings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    devLogApiError("POST /notification-bindings", res.status, text);
  } else {
    console.log(`[reply-notification] binding saved msgId=${data.telegramMessageId} taskId=${data.taskId} type=${data.notificationType}`);
  }
}

export async function findNotificationBinding(
  chatId: string,
  messageId: number,
): Promise<ApiNotificationBinding | null> {
  const url = new URL(`${getApiBaseUrl()}/notification-bindings/lookup`);
  url.searchParams.set("chatId", chatId);
  url.searchParams.set("messageId", String(messageId));
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    devLogApiError("GET /notification-bindings/lookup", res.status, text);
    return null;
  }
  return res.json() as Promise<ApiNotificationBinding>;
}
