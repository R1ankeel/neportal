import type { Api } from "grammy";
import {
  fetchUsers,
  type ApiTaskCreated,
  type ApiTaskStatusUpdated,
  type ApiUser,
  type TaskNotificationType,
  recordTaskNotification,
} from "./api";
import type { ResolvedAddTaskComment } from "./intent-resolver";
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

/** Уведомление creator/assignee о новом комментарии (без TaskNotificationLog). */
export async function notifyTaskCommentAdded(
  api: Api,
  task: ResolvedAddTaskComment,
  author: ApiUser,
): Promise<void> {
  const users = await fetchUsers();
  const creator = users.find((u) => u.id === task.creatorId);
  const assignee = task.assigneeId ? users.find((u) => u.id === task.assigneeId) : undefined;

  const text = [
    `Новый комментарий к задаче «${task.taskTitle}».`,
    "",
    `Автор: ${author.fullName}`,
    `Комментарий: ${task.text}`,
  ].join("\n");

  if (author.id === task.assigneeId && creator?.telegramId && creator.id !== author.id) {
    await sendTelegramMessage(api, creator.telegramId, text);
    return;
  }

  if (author.id === task.creatorId && assignee?.telegramId && assignee.id !== author.id) {
    await sendTelegramMessage(api, assignee.telegramId, text);
  }
}

/** Уведомление приглашённому сотруднику (без TaskNotificationLog). Возвращает true, если Telegram отправлен. */
export async function notifyTaskMentionRequested(
  api: Api,
  params: {
    taskTitle: string;
    projectName?: string | null;
    text: string;
    author: ApiUser;
    mentionedUser: { id: string; fullName: string; telegramId: string | null };
  },
): Promise<boolean> {
  const { mentionedUser, author, taskTitle, projectName, text } = params;
  if (!mentionedUser.telegramId) return false;

  const lines = [
    `${author.fullName} попросил вас прокомментировать задачу «${taskTitle}».`,
    "",
    projectName ? `Проект: ${projectName}` : null,
    `Комментарий: ${text}`,
  ].filter((line): line is string => line != null);

  await sendTelegramMessage(api, mentionedUser.telegramId, lines.join("\n"));
  return true;
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

/** OWNER/MANAGER: задача передана сразу. */
export async function notifyTransferImmediate(
  api: Api,
  params: {
    taskTitle: string;
    projectName?: string | null;
    comment: string;
    author: ApiUser;
    toUser: { id: string; fullName: string; telegramId: string | null };
  },
): Promise<void> {
  if (!params.toUser.telegramId) return;

  const lines = [
    `Вам передали задачу «${params.taskTitle}».`,
    "",
    params.projectName ? `Проект: ${params.projectName}` : null,
    `Передал: ${params.author.fullName}`,
    `Комментарий: ${params.comment}`,
  ].filter((line): line is string => line != null);

  await sendTelegramMessage(api, params.toUser.telegramId, lines.join("\n"));
}

/** EMPLOYEE: запрос на принятие передачи. */
export async function notifyTransferPending(
  api: Api,
  params: {
    taskTitle: string;
    projectName?: string | null;
    comment: string;
    author: ApiUser;
    toUser: { id: string; fullName: string; telegramId: string | null };
  },
): Promise<void> {
  if (!params.toUser.telegramId) return;

  const lines = [
    `${params.author.fullName} хочет передать вам задачу «${params.taskTitle}».`,
    "",
    params.projectName ? `Проект: ${params.projectName}` : null,
    `Комментарий: ${params.comment}`,
    "",
    "Принять задачу? Ответьте: да / нет",
  ].filter((line): line is string => line != null);

  await sendTelegramMessage(api, params.toUser.telegramId, lines.join("\n"));
}

/** Уведомление инициатору о принятии. */
export async function notifyTransferAccepted(
  api: Api,
  params: {
    taskTitle: string;
    toUserName: string;
    requestedById: string;
  },
): Promise<void> {
  const users = await fetchUsers();
  const requester = users.find((u) => u.id === params.requestedById);
  if (!requester?.telegramId) return;

  await sendTelegramMessage(
    api,
    requester.telegramId,
    `${params.toUserName} принял задачу «${params.taskTitle}».`,
  );
}

/** Уведомление инициатору об отказе. */
export async function notifyTransferRejected(
  api: Api,
  params: {
    taskTitle: string;
    toUserName: string;
    requestedById: string;
    rejectionReason: string;
  },
): Promise<void> {
  const users = await fetchUsers();
  const requester = users.find((u) => u.id === params.requestedById);
  if (!requester?.telegramId) return;

  const text = [
    `${params.toUserName} отказался принять задачу «${params.taskTitle}».`,
    "",
    `Причина: ${params.rejectionReason}`,
  ].join("\n");

  await sendTelegramMessage(api, requester.telegramId, text);
}
