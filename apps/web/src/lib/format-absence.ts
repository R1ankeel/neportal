import type { ApiAbsenceAffectedTask } from "@/lib/types";
import { formatDate, taskStatusLabel } from "@/lib/format";

export function groupAffectedTasksByProject(
  tasks: ApiAbsenceAffectedTask[],
): Array<{ projectName: string; tasks: ApiAbsenceAffectedTask[] }> {
  const byProject = new Map<string, { projectName: string; tasks: ApiAbsenceAffectedTask[] }>();

  for (const task of tasks) {
    const projectId = task.project?.id ?? "";
    const projectName = task.project?.name?.trim() || "—";
    const existing = byProject.get(projectId);
    if (existing) {
      existing.tasks.push(task);
    } else {
      byProject.set(projectId, { projectName, tasks: [task] });
    }
  }

  return [...byProject.values()].sort((a, b) =>
    a.projectName.localeCompare(b.projectName, "ru"),
  );
}

export function affectedTasksTruncatedFooter(absence: {
  affectedTasksTruncated?: boolean;
}): string | null {
  return absence.affectedTasksTruncated ? "Показаны ближайшие 20 задач." : null;
}

export { formatDate, taskStatusLabel };
