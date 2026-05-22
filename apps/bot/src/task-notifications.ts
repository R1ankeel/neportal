import type { Api } from "grammy";
import {
  type ApiTaskCreated,
  type ApiTaskStatusUpdated,
  type ApiUser,
  type TaskNotificationType,
  recordTaskNotification,
} from "./api";
import type { TaskStatusChangeTarget } from "./task-status-flow";
import { formatIsoDateRu } from "./parse-ru-date";
import { sendTelegramMessage } from "./send-telegram";

export function formatTaskDeadline(deadlineAt: string | null | undefined): string {
  if (!deadlineAt) return "не указан";
  const iso = deadlineAt.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatIsoDateRu(iso);
  return deadlineAt;
}

function projectName(task: ApiTaskCreated): string {
  return task.project?.name ?? "—";
}

/** Уведомление исполнителю о новой задаче (после /task или AI create_task). */
export async function notifyTaskAssigned(
  api: Api,
  task: ApiTaskCreated,
): Promise<void> {
  const assignee = task.assignee;
  const creator = task.creator;
  if (!assignee?.telegramId || !assignee.id) return;
  if (task.assigneeId === task.creatorId) return;

  const text = [
    "Вам назначена новая задача.",
    "",
    `Проект: ${projectName(task)}`,
    `Задача: ${task.title}`,
    `Поставил: ${creator?.fullName ?? "—"}`,
    `Дедлайн: ${formatTaskDeadline(task.deadlineAt)}`,
  ].join("\n");

  await sendTelegramMessage(api, assignee.telegramId, text);
  await recordTaskNotification(task.id, assignee.id, "TASK_ASSIGNED");
}

export function buildDeadlineTomorrowMessage(task: {
  title: string;
  deadlineAt: string | null;
  project?: { name: string } | null;
}): string {
  return [
    "Завтра дедлайн по задаче.",
    "",
    `Проект: ${task.project?.name ?? "—"}`,
    `Задача: ${task.title}`,
    `Дедлайн: ${formatTaskDeadline(task.deadlineAt)}`,
  ].join("\n");
}

export function buildOverdueAssigneeMessage(task: {
  title: string;
  deadlineAt: string | null;
  project?: { name: string } | null;
}): string {
  return [
    "Задача просрочена.",
    "",
    `Проект: ${task.project?.name ?? "—"}`,
    `Задача: ${task.title}`,
    `Дедлайн был: ${formatTaskDeadline(task.deadlineAt)}`,
  ].join("\n");
}

export function buildOverdueCreatorMessage(task: {
  title: string;
  deadlineAt: string | null;
  project?: { name: string } | null;
  assignee?: { fullName: string } | null;
}): string {
  return [
    "Задача просрочена.",
    "",
    `Исполнитель: ${task.assignee?.fullName ?? "—"}`,
    `Проект: ${task.project?.name ?? "—"}`,
    `Задача: ${task.title}`,
    `Дедлайн был: ${formatTaskDeadline(task.deadlineAt)}`,
  ].join("\n");
}

/** Уведомление постановщику о закрытии/отмене задачи (не дублируется через TaskNotificationLog). */
export async function notifyTaskStatusChanged(
  api: Api,
  task: ApiTaskStatusUpdated,
  actor: ApiUser,
  target: TaskStatusChangeTarget,
): Promise<void> {
  const creator = task.creator;
  if (!creator?.telegramId || !creator.id) return;
  if (task.creatorId === actor.id) return;

  const logType: TaskNotificationType =
    target === "DONE" ? "TASK_COMPLETED_CREATOR" : "TASK_CANCELLED_CREATOR";

  const verb = target === "DONE" ? "закрыл" : "отменил";
  const lines = [`${actor.fullName} ${verb} задачу «${task.title}».`];
  if (target === "DONE" && task.completionResult?.trim()) {
    lines.push("", `Результат: ${task.completionResult.trim()}`);
  }
  if (target === "CANCELLED" && task.cancellationReason?.trim()) {
    lines.push("", `Причина отмены: ${task.cancellationReason.trim()}`);
  }

  await sendTelegramMessage(api, creator.telegramId, lines.join("\n"));
  await recordTaskNotification(task.id, creator.id, logType);
}

export async function sendAndLogNotification(
  api: Api,
  taskId: string,
  telegramId: string,
  userId: string,
  type: TaskNotificationType,
  text: string,
): Promise<void> {
  await sendTelegramMessage(api, telegramId, text);
  await recordTaskNotification(taskId, userId, type);
}
