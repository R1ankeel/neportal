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
};

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

export async function createTask(body: {
  title: string;
  creatorId: string;
  assigneeId?: string;
  projectId?: string;
}): Promise<{ id: string; title: string; project?: { id: string; name: string } | null }> {
  const res = await fetch(`${getApiBaseUrl()}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /tasks → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<{ id: string; title: string; project?: { id: string; name: string } | null }>;
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
  const res = await fetch(`${getApiBaseUrl()}/absences`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      ...body,
      status: body.status ?? "APPROVED",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /absences → ${res.status} ${text}`.trim());
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
