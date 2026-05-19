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

export async function createTask(body: {
  title: string;
  creatorId: string;
  assigneeId?: string;
}): Promise<{ id: string; title: string }> {
  const res = await fetch(`${getApiBaseUrl()}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /tasks → ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<{ id: string; title: string }>;
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
