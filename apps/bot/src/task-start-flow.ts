import type { Api } from "grammy";
import type { ApiTask, ApiUser } from "./api";
import { fetchTasks, updateTaskStatus } from "./api";
import type { ResolvedStartTask } from "./intent-resolver";
import { clearPendingConfirmation } from "./pending-intent";
import { clearPendingTaskCommentDetails } from "./pending-task-comment-details";
import { clearPendingTaskMentionDetails } from "./pending-task-mention-details";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";
import { canModifyTask } from "./task-status-flow";
import { notifyTaskStarted } from "./task-notifications";

export function buildResolvedStartTask(task: ApiTask): ResolvedStartTask {
  return {
    intent: "start_task",
    taskId: task.id,
    taskTitle: task.title,
  };
}

export type TaskStartLookupResult =
  | { ok: true; task: ApiTask }
  | { ok: false; message: string };

export async function lookupTaskForStart(
  currentUser: ApiUser,
  telegramUserId: number,
  titleQuery: string,
): Promise<TaskStartLookupResult> {
  const resolution = await resolveTaskByTitle(currentUser, titleQuery, "start", {
    telegramUserId,
  });

  if (resolution.kind === "found") {
    return { ok: true, task: resolution.task };
  }

  return { ok: false, message: resolveResultToMessage(resolution) };
}

export function statusBlockMessage(task: ApiTask): string | null {
  if (task.status === "IN_PROGRESS") {
    return `Задача уже в работе: ${task.title}`;
  }
  if (task.status === "DONE") {
    return `Задача уже выполнена: ${task.title}`;
  }
  if (task.status === "CANCELLED") {
    return `Задача отменена: ${task.title}`;
  }
  return null;
}

/** Выполнить PATCH IN_PROGRESS и уведомить постановщика (после confirmation). */
export async function executeStartTask(
  api: Api,
  currentUser: ApiUser,
  resolved: ResolvedStartTask,
): Promise<string> {
  const tasks = await fetchTasks();
  const task = tasks.find((t) => t.id === resolved.taskId);
  if (!task) {
    return "Задача не найдена.";
  }

  const blocked = statusBlockMessage(task);
  if (blocked) {
    return blocked;
  }

  if (!canModifyTask(currentUser, task)) {
    return "Вы не можете изменить эту задачу.";
  }

  const updated = await updateTaskStatus(resolved.taskId, "IN_PROGRESS");

  try {
    await notifyTaskStarted(api, updated, currentUser);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[task-notifications] start notify error: ${msg}`);
  }

  return `Задача взята в работу: ${updated.title}`;
}

export type SlashStartTaskResult =
  | { kind: "reply"; message: string }
  | { kind: "confirmation"; resolved: ResolvedStartTask };

export async function handleStartTaskSlashCommand(
  currentUser: ApiUser,
  telegramUserId: number,
  payload: string,
): Promise<SlashStartTaskResult> {
  const title = payload.trim();
  if (!title) {
    return {
      kind: "reply",
      message: "Укажите название: /start-task Проверить склад",
    };
  }

  const lookup = await lookupTaskForStart(currentUser, telegramUserId, title);
  if (!lookup.ok) {
    return { kind: "reply", message: lookup.message };
  }

  const blocked = statusBlockMessage(lookup.task);
  if (blocked) {
    return { kind: "reply", message: blocked };
  }

  if (!canModifyTask(currentUser, lookup.task)) {
    return { kind: "reply", message: "Вы не можете изменить эту задачу." };
  }

  clearPendingConfirmation(telegramUserId);
  clearPendingTaskStatusDetails(telegramUserId);
  clearPendingTaskCommentDetails(telegramUserId);
  clearPendingTaskMentionDetails(telegramUserId);

  return {
    kind: "confirmation",
    resolved: buildResolvedStartTask(lookup.task),
  };
}
