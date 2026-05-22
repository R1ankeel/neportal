import type { Api } from "grammy";
import type { AiIntent } from "./ai-contracts";
import {
  type ApiTask,
  type ApiUser,
  fetchTasks,
  updateTaskStatus,
} from "./api";
import { findTaskByTitle } from "./hint-matchers";
import type { ResolvedCancelTask, ResolvedCompleteTask } from "./intent-resolver";
import {
  clearPendingTaskStatusDetails,
  type PendingTaskStatusDetailsType,
  setPendingTaskStatusDetails,
} from "./pending-task-status-details";
import { clearPendingConfirmation } from "./pending-intent";
import { notifyTaskStatusChanged } from "./task-notifications";

export type TaskStatusChangeTarget = "DONE" | "CANCELLED";

const TITLE_SUFFIX_RE = /\s+(?:—|-|–|:)\s+/u;

export function canModifyTask(user: ApiUser, task: ApiTask): boolean {
  if (user.role === "OWNER" || user.role === "MANAGER") return true;
  return user.id === task.creatorId || user.id === task.assigneeId;
}

export function parseTaskTitleAndSuffix(payload: string): { title: string; suffix?: string } {
  const trimmed = payload.trim();
  if (!trimmed) return { title: "" };

  const match = TITLE_SUFFIX_RE.exec(trimmed);
  if (!match || match.index === undefined) {
    return { title: trimmed };
  }

  const title = trimmed.slice(0, match.index).trim();
  const suffix = trimmed.slice(match.index + match[0].length).trim();
  return { title, suffix: suffix || undefined };
}

export type TaskLookupResult =
  | { ok: true; task: ApiTask }
  | { ok: false; message: string };

export async function lookupTaskForStatusChange(
  currentUser: ApiUser,
  titleQuery: string,
  target: TaskStatusChangeTarget,
): Promise<TaskLookupResult> {
  const trimmed = titleQuery.trim();
  if (!trimmed) {
    return {
      ok: false,
      message:
        target === "DONE"
          ? "Укажите название: /done Проверить склад"
          : "Укажите название: /cancel Проверить склад",
    };
  }

  const tasks = await fetchTasks();
  const match = findTaskByTitle(tasks, trimmed);

  if (match.kind === "not_found") {
    return { ok: false, message: "Задача не найдена." };
  }
  if (match.kind === "ambiguous") {
    const names = match.tasks.map((t) => `«${t.title}»`).join(", ");
    return { ok: false, message: `Найдено несколько задач: ${names}. Уточните название.` };
  }

  const task = match.task;
  if (!canModifyTask(currentUser, task)) {
    return { ok: false, message: "Вы не можете изменить эту задачу." };
  }

  if (target === "DONE" && task.status === "DONE") {
    return { ok: false, message: `Задача уже закрыта: ${task.title}` };
  }
  if (target === "CANCELLED" && task.status === "CANCELLED") {
    return { ok: false, message: `Задача уже отменена: ${task.title}` };
  }

  return { ok: true, task };
}

export function questionForPendingDetails(
  type: PendingTaskStatusDetailsType,
  taskTitle: string,
): string {
  return type === "awaiting_completion_result"
    ? `Что сделано по задаче «${taskTitle}»?`
    : `Почему отменяем задачу «${taskTitle}»?`;
}

/** Запросить результат/причину (после проверки прав). */
export function startPendingTaskStatusDetails(
  telegramUserId: number,
  task: ApiTask,
  type: PendingTaskStatusDetailsType,
): string {
  clearPendingConfirmation(telegramUserId);
  setPendingTaskStatusDetails(telegramUserId, {
    type,
    taskId: task.id,
    taskTitle: task.title,
    createdAt: Date.now(),
  });
  return questionForPendingDetails(type, task.title);
}

export function buildResolvedCompleteTask(
  task: ApiTask,
  completionResult: string,
): ResolvedCompleteTask {
  return {
    intent: "complete_task",
    taskId: task.id,
    taskTitle: task.title,
    completionResult: completionResult.trim(),
  };
}

export function buildResolvedCancelTask(
  task: ApiTask,
  cancellationReason: string,
): ResolvedCancelTask {
  return {
    intent: "cancel_task",
    taskId: task.id,
    taskTitle: task.title,
    cancellationReason: cancellationReason.trim(),
  };
}

function successMessage(taskTitle: string, target: TaskStatusChangeTarget): string {
  return target === "DONE"
    ? `Задача закрыта: ${taskTitle}`
    : `Задача отменена: ${taskTitle}`;
}

/** Выполнить PATCH и уведомить постановщика (после confirmation). */
export async function executeTaskStatusChange(
  api: Api,
  currentUser: ApiUser,
  resolved: ResolvedCompleteTask | ResolvedCancelTask,
): Promise<string> {
  const target: TaskStatusChangeTarget =
    resolved.intent === "complete_task" ? "DONE" : "CANCELLED";

  const updated = await updateTaskStatus(resolved.taskId, target, {
    completionResult:
      resolved.intent === "complete_task" ? resolved.completionResult : undefined,
    cancellationReason:
      resolved.intent === "cancel_task" ? resolved.cancellationReason : undefined,
  });

  try {
    await notifyTaskStatusChanged(api, updated, currentUser, target);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[task-notifications] status notify error: ${msg}`);
  }

  return successMessage(updated.title, target);
}

export type SlashTaskStatusResult =
  | { kind: "reply"; message: string }
  | { kind: "confirmation"; resolved: ResolvedCompleteTask | ResolvedCancelTask };

/** Обработка /done и /cancel: без суффикса — вопрос; с суффиксом — confirmation. */
export async function handleTaskStatusSlashCommand(
  currentUser: ApiUser,
  telegramUserId: number,
  payload: string,
  target: TaskStatusChangeTarget,
): Promise<SlashTaskStatusResult> {
  const { title, suffix } = parseTaskTitleAndSuffix(payload);
  const lookup = await lookupTaskForStatusChange(currentUser, title, target);
  if (!lookup.ok) {
    return { kind: "reply", message: lookup.message };
  }

  const detailsType: PendingTaskStatusDetailsType =
    target === "DONE" ? "awaiting_completion_result" : "awaiting_cancellation_reason";

  if (!suffix?.trim()) {
    const message = startPendingTaskStatusDetails(telegramUserId, lookup.task, detailsType);
    return { kind: "reply", message };
  }

  clearPendingTaskStatusDetails(telegramUserId);
  const resolved =
    target === "DONE"
      ? buildResolvedCompleteTask(lookup.task, suffix)
      : buildResolvedCancelTask(lookup.task, suffix);

  return { kind: "confirmation", resolved };
}

export function aiIntentNeedsStatusDetails(intent: AiIntent): boolean {
  if (intent.intent === "complete_task") {
    return !intent.payload.completionResult?.trim();
  }
  if (intent.intent === "cancel_task") {
    return !intent.payload.cancellationReason?.trim();
  }
  return false;
}

export function pendingDetailsTypeForAiIntent(intent: AiIntent): PendingTaskStatusDetailsType | null {
  if (intent.intent === "complete_task") return "awaiting_completion_result";
  if (intent.intent === "cancel_task") return "awaiting_cancellation_reason";
  return null;
}
