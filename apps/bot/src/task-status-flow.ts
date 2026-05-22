import type { Api } from "grammy";
import type { AiIntent } from "./ai-contracts";
import {
  type ApiTask,
  type ApiUser,
  updateTaskStatus,
} from "./api";
import type { ResolvedCancelTask, ResolvedCompleteTask } from "./intent-resolver";
import { clearPendingTaskCommentDetails } from "./pending-task-comment-details";
import { clearPendingTaskMentionDetails } from "./pending-task-mention-details";
import {
  clearPendingTaskStatusDetails,
  type PendingTaskStatusDetailsType,
  setPendingTaskStatusDetails,
} from "./pending-task-status-details";
import { clearPendingConfirmation } from "./pending-intent";
import {
  purposeFromStatusTarget,
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";
import type { TaskSelectionPayload } from "./pending-task-selection";
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
  telegramUserId: number,
  titleQuery: string,
  target: TaskStatusChangeTarget,
  options?: { completionResult?: string; cancellationReason?: string },
): Promise<TaskLookupResult> {
  const purpose = purposeFromStatusTarget(target);
  const selectionPayload: TaskSelectionPayload = {};
  if (options?.completionResult?.trim()) {
    selectionPayload.completionResult = options.completionResult.trim();
  }
  if (options?.cancellationReason?.trim()) {
    selectionPayload.cancellationReason = options.cancellationReason.trim();
  }

  const resolution = await resolveTaskByTitle(currentUser, titleQuery, purpose, {
    telegramUserId,
    selectionPayload,
  });

  if (resolution.kind === "found") {
    return { ok: true, task: resolution.task };
  }

  return { ok: false, message: resolveResultToMessage(resolution) };
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
  clearPendingTaskCommentDetails(telegramUserId);
  clearPendingTaskMentionDetails(telegramUserId);
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
  const lookup = await lookupTaskForStatusChange(currentUser, telegramUserId, title, target, {
    ...(target === "DONE"
      ? { completionResult: suffix }
      : { cancellationReason: suffix }),
  });
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
