import type { ApiProject } from "./api";

export const NO_ACCESSIBLE_PROJECTS_MESSAGE =
  "Нет доступных проектов. Создайте проект в Web.";

export const PROJECT_SELECTION_CAP = 20;

export const PROJECT_SELECTION_TRUNCATED_NOTE =
  "Проектов слишком много, уточните название проекта текстом.";

export const PROJECT_SELECTION_NEEDED = "PROJECT_SELECTION_NEEDED";

export type ResolveProjectForActionResult =
  | { kind: "resolved"; project: ApiProject; autoSelected: boolean }
  | {
      kind: "selection_required";
      projects: ApiProject[];
      truncated: boolean;
    }
  | { kind: "not_found"; message: string }
  | { kind: "ambiguous"; message: string };

function projectMatchesHint(projects: ApiProject[], trimmed: string): ApiProject[] {
  const q = trimmed.toLowerCase();
  return projects.filter((p) => p.name.toLowerCase().includes(q));
}

export function sortProjectsAlphabetically(projects: ApiProject[]): ApiProject[] {
  return [...projects].sort((a, b) =>
    a.name.localeCompare(b.name, "ru", { sensitivity: "base" }),
  );
}

export function capProjectsForSelection(
  projects: ApiProject[],
): { projects: ApiProject[]; truncated: boolean } {
  const sorted = sortProjectsAlphabetically(projects);
  if (sorted.length <= PROJECT_SELECTION_CAP) {
    return { projects: sorted, truncated: false };
  }
  return { projects: sorted.slice(0, PROJECT_SELECTION_CAP), truncated: true };
}

/**
 * Strict match by non-empty hint only (Stage 5). No default project fallback.
 */
export function resolveProjectByStrictHint(
  projects: ApiProject[],
  hint: string,
): Exclude<ResolveProjectForActionResult, { kind: "selection_required" }> {
  const trimmed = hint.trim();
  if (!trimmed) {
    return {
      kind: "not_found",
      message: "Укажите название проекта.",
    };
  }

  const matches = projectMatchesHint(projects, trimmed);
  if (matches.length === 0) {
    return {
      kind: "not_found",
      message: `Не нашёл проект «${trimmed}». Проверьте название или доступ к проекту.`,
    };
  }
  if (matches.length === 1) {
    return { kind: "resolved", project: matches[0], autoSelected: false };
  }

  const q = trimmed.toLowerCase();
  const exact = matches.filter((p) => p.name.toLowerCase() === q);
  if (exact.length === 1) {
    return { kind: "resolved", project: exact[0], autoSelected: false };
  }

  const names = matches.map((p) => p.name).join(", ");
  return {
    kind: "ambiguous",
    message: `Нашлось несколько проектов по запросу «${trimmed}»: ${names}. Уточните название проекта.`,
  };
}

/**
 * Bot action resolver: empty hint → auto-select (1) or keyboard (2+); non-empty → strict hint.
 */
export function resolveProjectForAction(
  projects: ApiProject[],
  hint?: string,
): ResolveProjectForActionResult {
  if (projects.length === 0) {
    return { kind: "not_found", message: NO_ACCESSIBLE_PROJECTS_MESSAGE };
  }

  const trimmed = hint?.trim();
  if (trimmed) {
    return resolveProjectByStrictHint(projects, trimmed);
  }

  if (projects.length === 1) {
    return { kind: "resolved", project: projects[0], autoSelected: true };
  }

  const { projects: capped, truncated } = capProjectsForSelection(projects);
  return { kind: "selection_required", projects: capped, truncated };
}

export function resolveProjectForActionMessage(
  result: ResolveProjectForActionResult,
): string | null {
  if (result.kind === "not_found" || result.kind === "ambiguous") {
    return result.message;
  }
  return null;
}
