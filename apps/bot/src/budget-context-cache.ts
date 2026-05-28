import type { ApiProject } from "./api";
import { fetchBudgets } from "./api";
import { devLog } from "./dev-log";

export type PromptBudgetRow = { title: string; projectName: string };

type CacheEntry = {
  rows: PromptBudgetRow[];
  expiresAt: number;
};

const DEFAULT_TTL_MS = 45_000;

const cache = new Map<string, CacheEntry>();

function ttlMs(): number {
  const raw = process.env.BUDGET_CONTEXT_CACHE_TTL_MS?.trim();
  if (!raw) return DEFAULT_TTL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL_MS;
  return Math.round(n);
}

/** Ключ кэша prompt budget context (single-tenant bot; userId — опциональный scope). */
export function budgetContextCacheKey(linkedUserId?: string): string {
  return `budget-context:${linkedUserId?.trim() || "all"}`;
}

/** Сброс кэша (dev/tests). */
export function clearBudgetContextCache(): void {
  cache.clear();
}

async function fetchBudgetRows(
  projects: ApiProject[],
  actorUserId: string,
  linkedUserId?: string,
): Promise<PromptBudgetRow[]> {
  const budgets: PromptBudgetRow[] = [];
  for (const project of projects) {
    const projectBudgets = await fetchBudgets(project.id, actorUserId, linkedUserId);
    for (const budget of projectBudgets) {
      budgets.push({ title: budget.title, projectName: project.name });
    }
  }
  return budgets;
}

/**
 * Бюджеты для LLM prompt context (ACTIVE-only через API).
 * Не использовать для финального сохранения расхода.
 */
export async function loadPromptBudgetContext(
  projects: ApiProject[],
  options?: { linkedUserId?: string },
): Promise<{ rows: PromptBudgetRow[]; cacheHit: boolean }> {
  const key = budgetContextCacheKey(options?.linkedUserId);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    devLog("budget-context cache hit", { key, rows: hit.rows.length });
    return { rows: hit.rows, cacheHit: true };
  }

  const actorUserId = options?.linkedUserId?.trim();
  if (!actorUserId) {
    return { rows: [], cacheHit: false };
  }
  const rows = await fetchBudgetRows(projects, actorUserId, actorUserId);
  cache.set(key, { rows, expiresAt: now + ttlMs() });
  devLog("budget-context cache miss", { key, rows: rows.length, ttlMs: ttlMs() });
  return { rows, cacheHit: false };
}
