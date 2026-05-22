import type { Api } from "grammy";
import {
  type ApiTask,
  type ApiUser,
  fetchTasks,
  updateTaskStatus,
} from "./api";
import { findTaskByTitle } from "./hint-matchers";
import { notifyTaskStatusChanged } from "./task-notifications";

export type TaskStatusChangeTarget = "DONE" | "CANCELLED";

export function canModifyTask(user: ApiUser, task: ApiTask): boolean {
  if (user.role === "OWNER" || user.role === "MANAGER") return true;
  return user.id === task.creatorId || user.id === task.assigneeId;
}

function alreadyStatusMessage(task: ApiTask, target: TaskStatusChangeTarget): string | null {
  if (target === "DONE" && task.status === "DONE") {
    return `Задача уже закрыта: ${task.title}`;
  }
  if (target === "CANCELLED" && task.status === "CANCELLED") {
    return `Задача уже отменена: ${task.title}`;
  }
  return null;
}

function successMessage(taskTitle: string, target: TaskStatusChangeTarget): string {
  return target === "DONE"
    ? `Задача закрыта: ${taskTitle}`
    : `Задача отменена: ${taskTitle}`;
}

export async function changeTaskStatusByTitle(
  api: Api,
  currentUser: ApiUser,
  titleQuery: string,
  target: TaskStatusChangeTarget,
): Promise<string> {
  const trimmed = titleQuery.trim();
  if (!trimmed) {
    return target === "DONE"
      ? "Укажите название: /done Проверить склад"
      : "Укажите название: /cancel Проверить склад";
  }

  const tasks = await fetchTasks();
  const match = findTaskByTitle(tasks, trimmed);

  if (match.kind === "not_found") {
    return "Задача не найдена.";
  }
  if (match.kind === "ambiguous") {
    const names = match.tasks.map((t) => `«${t.title}»`).join(", ");
    return `Найдено несколько задач: ${names}. Уточните название.`;
  }

  const task = match.task;
  if (!canModifyTask(currentUser, task)) {
    return "Вы не можете изменить эту задачу.";
  }

  const already = alreadyStatusMessage(task, target);
  if (already) return already;

  const updated = await updateTaskStatus(task.id, target);

  try {
    await notifyTaskStatusChanged(api, updated, currentUser, target);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[task-notifications] status notify error: ${msg}`);
  }

  return successMessage(updated.title, target);
}
