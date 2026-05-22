import { fetchMyTasks, type ApiMyTask } from "./api";
import { formatIsoDateRu } from "./parse-ru-date";

function localCalendarIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function deadlineCalendarIso(deadlineAt: string): string {
  const d = new Date(deadlineAt);
  return localCalendarIso(d);
}

/** Дедлайн для списка задач: сегодня / завтра / DD.MM.YYYY / не указан. */
export function formatTaskDeadlineForList(deadlineAt: string | null | undefined): string {
  if (!deadlineAt) return "не указан";

  const iso = deadlineCalendarIso(deadlineAt);
  const now = new Date();
  const today = localCalendarIso(now);
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrow = localCalendarIso(tomorrowDate);

  if (iso === today) return "сегодня";
  if (iso === tomorrow) return "завтра";
  return formatIsoDateRu(iso);
}

export function taskStatusLabel(status: string): string {
  switch (status) {
    case "NEW":
      return "Новая";
    case "IN_PROGRESS":
      return "В работе";
    default:
      return status;
  }
}

export function formatMyTasksList(tasks: ApiMyTask[]): string {
  if (tasks.length === 0) {
    return "У вас нет активных задач.";
  }

  const lines = ["Ваши ближайшие задачи:", ""];
  tasks.forEach((task, index) => {
    const projectName = task.project?.name ?? "—";
    lines.push(
      `${index + 1}. ${task.title}`,
      `   Проект: ${projectName}`,
      `   Дедлайн: ${formatTaskDeadlineForList(task.deadlineAt)}`,
      `   Статус: ${taskStatusLabel(task.status)}`,
    );
    if (index < tasks.length - 1) {
      lines.push("");
    }
  });
  return lines.join("\n");
}

export async function formatMyTasksReply(userId: string, limit = 5): Promise<string> {
  const tasks = await fetchMyTasks(userId, limit);
  return formatMyTasksList(tasks);
}
