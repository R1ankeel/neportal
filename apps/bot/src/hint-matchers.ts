import type { ApiBudget, ApiProject, ApiTask, ApiUser } from "./api";
import { pickDefaultBudget, pickDefaultProject } from "./api";
import { resolveUsersByHint } from "./resolve-users-by-hint";

export function findProjectByHint(projects: ApiProject[], hint?: string): ApiProject | null {
  if (projects.length === 0) return null;
  const trimmed = hint?.trim();
  if (!trimmed) return pickDefaultProject(projects);

  const q = trimmed.toLowerCase();
  const matches = projects.filter((p) => p.name.toLowerCase().includes(q));
  if (matches.length === 0) return pickDefaultProject(projects);
  if (matches.length === 1) return matches[0];

  const exact = matches.find((p) => p.name.toLowerCase() === q);
  return exact ?? matches[0];
}

export function findUserByHint(
  users: ApiUser[],
  hint?: string,
  currentUser?: ApiUser | null,
): ApiUser | undefined {
  const trimmed = hint?.trim();
  if (!trimmed) return undefined;

  const match = resolveUsersByHint(users, trimmed, currentUser ?? null);
  if (match.kind === "one") return match.user;
  return undefined;
}

export function findBudgetByHint(budgets: ApiBudget[], hint?: string): ApiBudget | null {
  if (budgets.length === 0) return null;
  const trimmed = hint?.trim();
  if (!trimmed) return pickDefaultBudget(budgets);

  const q = trimmed.toLowerCase();
  const matches = budgets.filter((b) => b.title.toLowerCase().includes(q));
  if (matches.length === 0) return pickDefaultBudget(budgets);
  if (matches.length === 1) return matches[0];

  const exact = matches.find((b) => b.title.toLowerCase() === q);
  return exact ?? matches[0];
}

export type TaskMatchResult =
  | { kind: "found"; task: ApiTask }
  | { kind: "not_found" }
  | { kind: "ambiguous"; tasks: ApiTask[] };

export function findTaskByTitle(tasks: ApiTask[], taskTitle: string): TaskMatchResult {
  const trimmed = taskTitle.trim();
  if (!trimmed) return { kind: "not_found" };

  const q = trimmed.toLowerCase();
  const exact = tasks.filter((t) => t.title.toLowerCase() === q);
  if (exact.length === 1) return { kind: "found", task: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous", tasks: exact };

  const partial = tasks.filter((t) => t.title.toLowerCase().includes(q));
  if (partial.length === 0) return { kind: "not_found" };
  if (partial.length === 1) return { kind: "found", task: partial[0] };
  return { kind: "ambiguous", tasks: partial };
}
