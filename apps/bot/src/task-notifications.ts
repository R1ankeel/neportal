import type { Api } from "grammy";
import {
  fetchUsers,
  type ApiTaskCreated,
  type ApiTaskStatusUpdated,
  type ApiUser,
  type TaskNotificationType,
  recordTaskNotification,
  createNotificationBinding,
} from "./api";
import type { ResolvedAddTaskComment } from "./intent-resolver";
import type { TaskStatusChangeTarget } from "./task-status-flow";
import { formatIsoDateRu } from "./parse-ru-date";
import { sendTelegramMessage } from "./send-telegram";
import { buildTaskNotificationKeyboard } from "./telegram/keyboards/task-notification-keyboard";

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

  const sent = await sendTelegramMessage(api, assignee.telegramId, text);
  await recordTaskNotification(task.id, assignee.id, "TASK_ASSIGNED");

  createNotificationBinding({
    telegramChatId: String(sent.chat.id),
    telegramMessageId: sent.message_id,
    taskId: task.id,
    notificationType: "NEW_TASK",
  }).catch(() => {});
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

/** Уведомление постановщику о взятии задачи в работу (не дублируется через TaskNotificationLog). */
export async function notifyTaskStarted(
  api: Api,
  task: ApiTaskStatusUpdated,
  actor: ApiUser,
): Promise<void> {
  const creator = task.creator;
  if (!creator?.telegramId || !creator.id) return;
  if (task.creatorId === actor.id) return;

  const text = `${actor.fullName} взял задачу «${task.title}» в работу.`;
  await sendTelegramMessage(api, creator.telegramId, text);
  await recordTaskNotification(task.id, creator.id, "TASK_STARTED_CREATOR");
}

/** Уведомление creator/assignee о новом комментарии (без TaskNotificationLog). */
export async function notifyTaskCommentAdded(
  api: Api,
  task: ResolvedAddTaskComment,
  author: ApiUser,
  commentId?: string,
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

  const keyboard = buildTaskNotificationKeyboard(task.taskId);

  if (author.id === task.assigneeId && creator?.telegramId && creator.id !== author.id) {
    const sent = await sendTelegramMessage(api, creator.telegramId, text, { reply_markup: keyboard });
    if (commentId) {
      createNotificationBinding({
        telegramChatId: String(sent.chat.id),
        telegramMessageId: sent.message_id,
        taskId: task.taskId,
        sourceCommentId: commentId,
        sourceCommentAuthorId: author.id,
        notificationType: "TASK_COMMENT",
      }).catch(() => {});
    }
    return;
  }

  if (author.id === task.creatorId && assignee?.telegramId && assignee.id !== author.id) {
    const sent = await sendTelegramMessage(api, assignee.telegramId, text, { reply_markup: keyboard });
    if (commentId) {
      createNotificationBinding({
        telegramChatId: String(sent.chat.id),
        telegramMessageId: sent.message_id,
        taskId: task.taskId,
        sourceCommentId: commentId,
        sourceCommentAuthorId: author.id,
        notificationType: "TASK_COMMENT",
      }).catch(() => {});
    }
  }
}

/** Уведомление приглашённому сотруднику (без TaskNotificationLog). Возвращает true, если Telegram отправлен. */
export async function notifyTaskMentionRequested(
  api: Api,
  params: {
    taskId: string;
    taskTitle: string;
    projectName?: string | null;
    text: string;
    author: ApiUser;
    mentionedUser: { id: string; fullName: string; telegramId: string | null };
    commentId?: string;
  },
): Promise<boolean> {
  const { mentionedUser, taskTitle, projectName, text, taskId } = params;
  if (!mentionedUser.telegramId) return false;

  const lines = [
    `Вас упомянули в комментарии к задаче «${taskTitle}».`,
    "",
    projectName ? `Проект: ${projectName}` : null,
    `Комментарий: ${text}`,
  ].filter((line): line is string => line != null);

  const sent = await sendTelegramMessage(api, mentionedUser.telegramId, lines.join("\n"), {
    reply_markup: buildTaskNotificationKeyboard(taskId),
  });

  if (params.commentId) {
    createNotificationBinding({
      telegramChatId: String(sent.chat.id),
      telegramMessageId: sent.message_id,
      taskId,
      sourceCommentId: params.commentId,
      sourceCommentAuthorId: params.author.id,
      notificationType: "TASK_MENTION",
    }).catch(() => {});
  }

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
    taskId?: string;
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

  const sent = await sendTelegramMessage(api, params.toUser.telegramId, lines.join("\n"));

  if (params.taskId) {
    createNotificationBinding({
      telegramChatId: String(sent.chat.id),
      telegramMessageId: sent.message_id,
      taskId: params.taskId,
      notificationType: "TASK_TRANSFER",
    }).catch(() => {});
  }
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

/** OWNER/MANAGER: переназначение задачи между сотрудниками. */
export async function notifyReassign(
  api: Api,
  params: {
    taskId?: string;
    taskTitle: string;
    projectName?: string | null;
    comment: string;
    author: ApiUser;
    toUser: { id: string; fullName: string; telegramId: string | null };
    oldAssignee: { id: string; fullName: string; telegramId: string | null } | null;
    creator: { id: string; fullName: string; telegramId: string | null } | null;
    oldAssigneeName: string | null;
  },
): Promise<void> {
  const sentTelegramIds = new Set<string>();
  const sentUserIds = new Set<string>();

  const markSent = (userId: string, telegramId: string) => {
    sentUserIds.add(userId);
    sentTelegramIds.add(telegramId);
  };

  const shouldSend = (userId: string, telegramId: string | null): telegramId is string => {
    if (!telegramId) return false;
    if (sentTelegramIds.has(telegramId)) return false;
    if (sentUserIds.has(userId)) return false;
    return true;
  };

  if (shouldSend(params.toUser.id, params.toUser.telegramId)) {
    const lines = [
      `Вам передали задачу «${params.taskTitle}».`,
      "",
      params.projectName ? `Проект: ${params.projectName}` : null,
      `Передал: ${params.author.fullName}`,
      `Комментарий: ${params.comment}`,
    ].filter((line): line is string => line != null);
    const sent = await sendTelegramMessage(api, params.toUser.telegramId, lines.join("\n"));
    markSent(params.toUser.id, params.toUser.telegramId);
    if (params.taskId) {
      createNotificationBinding({
        telegramChatId: String(sent.chat.id),
        telegramMessageId: sent.message_id,
        taskId: params.taskId,
        notificationType: "TASK_TRANSFER",
      }).catch(() => {});
    }
  }

  if (
    params.oldAssignee &&
    params.oldAssignee.id !== params.toUser.id &&
    shouldSend(params.oldAssignee.id, params.oldAssignee.telegramId)
  ) {
    await sendTelegramMessage(
      api,
      params.oldAssignee.telegramId,
      `Задачу «${params.taskTitle}» перенесли на ${params.toUser.fullName}.`,
    );
    markSent(params.oldAssignee.id, params.oldAssignee.telegramId);
  }

  if (
    params.creator &&
    params.creator.id !== params.author.id &&
    shouldSend(params.creator.id, params.creator.telegramId)
  ) {
    const was = params.oldAssigneeName?.trim() || "не назначен";
    const lines = [
      `Задача «${params.taskTitle}» передана новому исполнителю.`,
      "",
      `Было: ${was}`,
      `Стало: ${params.toUser.fullName}`,
      `Передал: ${params.author.fullName}`,
      `Комментарий: ${params.comment}`,
    ];
    await sendTelegramMessage(api, params.creator.telegramId, lines.join("\n"));
    markSent(params.creator.id, params.creator.telegramId);
  }
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
