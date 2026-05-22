import type { ApiAbsenceAffectedTask } from "./api";
import { formatTaskDeadline } from "./task-notifications";
import type { AbsenceDelegationTaskItem } from "./pending-absence-delegation";

export function taskStatusLabelRu(status: string): string {
  switch (status) {
    case "NEW":
      return "Новая";
    case "IN_PROGRESS":
      return "В работе";
    case "DONE":
      return "Выполнена";
    case "CANCELLED":
      return "Отменена";
    default:
      return status;
  }
}

export function toAbsenceDelegationTasks(
  tasks: ApiAbsenceAffectedTask[],
): AbsenceDelegationTaskItem[] {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    deadlineAt: t.deadlineAt,
    status: t.status,
    projectName: t.project?.name ?? null,
    creatorId: t.creator.id,
    creatorName: t.creator.fullName,
  }));
}

export function formatAbsenceDelegationTaskList(tasks: AbsenceDelegationTaskItem[]): string {
  const showProject = new Set(tasks.map((t) => t.projectName ?? "")).size > 1;

  return tasks
    .map((t, i) => {
      const lines = [
        `${i + 1}. ${t.title}`,
        ...(showProject && t.projectName ? [`   Проект: ${t.projectName}`] : []),
        `   Дедлайн: ${formatTaskDeadline(t.deadlineAt)}`,
        `   Статус: ${taskStatusLabelRu(t.status)}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

export function formatAbsenceDelegationTaskListCompact(
  tasks: AbsenceDelegationTaskItem[],
): string {
  return tasks
    .map((t, i) => {
      const deadline = formatTaskDeadline(t.deadlineAt);
      const status = taskStatusLabelRu(t.status);
      return `${i + 1}. ${t.title} — ${deadline} — ${status}`;
    })
    .join("\n");
}

/** Парсит «1», «1,3», «1 3», «1 и 3»; «все»/«всё» → all; иначе null. */
export function parseAbsenceTaskSelectionNumbers(
  text: string,
  taskCount: number,
): number[] | "all" | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "все" || normalized === "всё") return "all";

  const nums = new Set<number>();
  const parts = normalized.split(/[,;]|\s+и\s+|\s+/u).filter(Boolean);
  for (const part of parts) {
    const n = Number.parseInt(part, 10);
    if (Number.isInteger(n) && n >= 1 && n <= taskCount) {
      nums.add(n);
    }
  }

  if (nums.size === 0) return null;
  return [...nums].sort((a, b) => a - b);
}

export function buildDelegationResultMessage(
  fullName: string,
  results: Array<{ status: "PENDING" | "ACCEPTED" }>,
): string {
  const count = results.length;
  const pendingCount = results.filter((r) => r.status === "PENDING").length;
  const acceptedCount = results.filter((r) => r.status === "ACCEPTED").length;

  if (pendingCount === count) {
    return `Запросы на передачу ${count} ${taskWord(count)} отправлены сотруднику ${fullName}.`;
  }
  if (acceptedCount === count) {
    return `${count} ${taskWord(count)} переданы сотруднику ${fullName}.`;
  }
  return `Готово: ${acceptedCount} ${taskWord(acceptedCount)} переданы, ${pendingCount} ${requestWord(pendingCount)} отправлены сотруднику ${fullName}.`;
}

function taskWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "задача";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "задачи";
  return "задач";
}

function requestWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запрос";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "запроса";
  return "запросов";
}
