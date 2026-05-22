import type { TaskCandidate } from "./pending-task-selection";
import { formatTaskDeadline } from "./task-notifications";

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};

export function taskStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatTaskCandidates(candidates: TaskCandidate[]): string {
  const lines = ["Нашёл несколько похожих задач:", ""];

  candidates.forEach((task, index) => {
    const n = index + 1;
    lines.push(`${n}. ${task.title}`);
    lines.push(`   Проект: ${task.project?.name ?? "—"}`);
    lines.push(
      `   Исполнитель: ${task.assignee?.fullName ?? "не назначен"}`,
    );
    lines.push(`   Дедлайн: ${formatTaskDeadline(task.deadlineAt)}`);
    lines.push(`   Статус: ${taskStatusLabel(task.status)}`);
    if (index < candidates.length - 1) lines.push("");
  });

  lines.push("", "Напишите номер задачи.");
  return lines.join("\n");
}
