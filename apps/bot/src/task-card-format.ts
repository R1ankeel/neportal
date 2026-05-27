import type { ApiTaskDetail } from "./api";
import { taskStatusLabelRu } from "./absence-delegation-format";
import { formatTaskDeadlineForList } from "./my-tasks-flow";

/** Карточка одной задачи для ответа бота (кнопка «Показать задачу»). */
export function formatTaskCard(task: ApiTaskDetail): string {
  const lines = [
    `Задача: ${task.title}`,
    `Проект: ${task.project?.name ?? "—"}`,
    `Статус: ${taskStatusLabelRu(task.status)}`,
    `Исполнитель: ${task.assignee?.fullName ?? "не назначен"}`,
    `Автор: ${task.creator?.fullName ?? "—"}`,
    `Дедлайн: ${formatTaskDeadlineForList(task.deadlineAt)}`,
  ];

  const description = task.description?.trim();
  if (description) {
    lines.push("", `Описание: ${description}`);
  }

  if (task.status === "DONE" && task.completionResult?.trim()) {
    lines.push("", `Результат: ${task.completionResult.trim()}`);
  }

  if (task.status === "CANCELLED" && task.cancellationReason?.trim()) {
    lines.push("", `Причина отмены: ${task.cancellationReason.trim()}`);
  }

  return lines.join("\n");
}
