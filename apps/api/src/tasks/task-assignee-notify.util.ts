import { formatDeadlineAtRu } from "./task-deadline-notify.util";

export function buildTaskAssigneeAssignedMessage(
  title: string,
  deadlineAt: Date | null | undefined,
): string {
  return [
    "Вам назначена задача",
    "",
    `Задача: ${title.trim() || "—"}`,
    `Дедлайн: ${formatDeadlineAtRu(deadlineAt)}`,
  ].join("\n");
}

export function buildTaskAssigneeUnassignedMessage(title: string): string {
  return [
    "Задача больше не назначена на вас",
    "",
    `Задача: ${title.trim() || "—"}`,
  ].join("\n");
}
