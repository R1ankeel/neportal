import type { ApiProject, ApiTask, ApiUser } from "./api";
import {
  NO_ACCESSIBLE_PROJECTS_MESSAGE,
  resolveProjectByStrictHint,
} from "./project-resolution";
import { resolveUsersByHint } from "./resolve-users-by-hint";
import {
  scoreTaskTitleMatch,
  TASK_MATCH_CLEAR_WIN_SCORE,
  TASK_MATCH_MIN_SCORE,
  TASK_MATCH_SCORE_GAP,
} from "./task-search-text";

export type ResolveProjectResult =
  | { kind: "found"; project: ApiProject }
  | { kind: "not_found"; message: string }
  | { kind: "ambiguous"; message: string };

/**
 * Resolves a project from a non-empty hint among projects accessible to the actor.
 * Empty hint → not_found (use resolveProjectForAction for bot actions).
 */
export function resolveProjectFromHint(
  projects: ApiProject[],
  hint?: string,
): ResolveProjectResult {
  if (projects.length === 0) {
    return {
      kind: "not_found",
      message: NO_ACCESSIBLE_PROJECTS_MESSAGE,
    };
  }

  const trimmed = hint?.trim();
  if (!trimmed) {
    return {
      kind: "not_found",
      message: "Укажите название проекта.",
    };
  }

  const result = resolveProjectByStrictHint(projects, trimmed);
  if (result.kind === "resolved") {
    return { kind: "found", project: result.project };
  }
  return { kind: result.kind, message: result.message };
}

/** @deprecated Prefer resolveProjectForAction / resolveProjectFromHint. */
export function findProjectByHint(projects: ApiProject[], hint?: string): ApiProject | null {
  const result = resolveProjectFromHint(projects, hint);
  if (result.kind === "found") {
    return result.project;
  }
  return null;
}

export function resolveProjectMessage(result: ResolveProjectResult): string | null {
  if (result.kind === "not_found" || result.kind === "ambiguous") {
    return result.message;
  }
  return null;
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

export type TaskMatchResult =
  | { kind: "found"; task: ApiTask }
  | { kind: "not_found" }
  | { kind: "ambiguous"; tasks: ApiTask[] };

function findTaskByTitleLegacy(tasks: ApiTask[], taskTitle: string): TaskMatchResult {
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

export function findTaskByTitle(tasks: ApiTask[], taskTitle: string): TaskMatchResult {
  const trimmed = taskTitle.trim();
  if (!trimmed) return { kind: "not_found" };

  const scored = tasks
    .map((task) => ({ task, score: scoreTaskTitleMatch(task.title, trimmed) }))
    .filter((entry) => entry.score >= TASK_MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return findTaskByTitleLegacy(tasks, trimmed);
  }

  const top = scored[0]!;
  const close = scored.filter(
    (entry) => top.score - entry.score < TASK_MATCH_SCORE_GAP,
  );

  if (
    top.score >= TASK_MATCH_CLEAR_WIN_SCORE &&
    (close.length === 1 || top.score - close[1]!.score >= TASK_MATCH_SCORE_GAP)
  ) {
    return { kind: "found", task: top.task };
  }

  if (close.length === 1) {
    return { kind: "found", task: top.task };
  }

  return { kind: "ambiguous", tasks: close.map((entry) => entry.task) };
}
