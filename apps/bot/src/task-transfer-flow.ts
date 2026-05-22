import type { Api } from "grammy";
import type { ApiTask, ApiUser } from "./api";
import {
  acceptTaskTransfer,
  createTaskTransfer,
  fetchUsers,
  findUserByNameHint,
  rejectTaskTransfer,
  type UserNameMatchResult,
} from "./api";
import type { ResolvedTransferTask } from "./intent-resolver";
import { clearPendingConfirmation } from "./pending-intent";
import { clearPendingTaskCommentDetails } from "./pending-task-comment-details";
import { clearPendingTaskMentionDetails } from "./pending-task-mention-details";
import { clearPendingTaskSelection } from "./pending-task-selection";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import {
  clearPendingTaskTransferComment,
  setPendingTaskTransferComment,
} from "./pending-task-transfer-comment";
import { setPendingTaskTransferDecision } from "./pending-task-transfer-decision";
import type { TaskSelectionPayload } from "./pending-task-selection";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";
import { canModifyTask } from "./task-status-flow";
import {
  notifyTransferAccepted,
  notifyTransferImmediate,
  notifyTransferPending,
  notifyTransferRejected,
} from "./task-notifications";

const TRANSFER_PARTS_RE = /\s*(?:\||—|–|-)\s*/u;

export { canModifyTask as canTransferTask };

export function isManagerOrOwner(role: string): boolean {
  return role === "OWNER" || role === "MANAGER";
}

export function requiresTransferApproval(role: string): boolean {
  return role === "EMPLOYEE" || role === "ACCOUNTANT";
}

export function parseTransferSlashPayload(payload: string): {
  taskTitle?: string;
  toUserHint?: string;
  comment?: string;
} {
  const trimmed = payload.trim();
  if (!trimmed) return {};

  const parts = trimmed.split(TRANSFER_PARTS_RE).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return {};

  return {
    taskTitle: parts[0],
    toUserHint: parts[1],
    comment: parts.length >= 3 ? parts.slice(2).join(" — ") : undefined,
  };
}

export function questionForTransferComment(taskTitle: string): string {
  return `Почему передаём задачу «${taskTitle}»?`;
}

export function resolveTransferTargetUser(
  users: ApiUser[],
  hint: string,
): UserNameMatchResult & { message?: string } {
  const match = findUserByNameHint(users, hint);
  if (match.kind === "none") {
    return {
      kind: "none",
      message: `Не нашёл сотрудника «${hint}». Проверьте имя.`,
    };
  }
  if (match.kind === "many") {
    const names = match.users.map((u) => u.fullName).join(", ");
    return {
      kind: "many",
      users: match.users,
      message: `Нашёл несколько сотрудников: ${names}. Уточните ФИО.`,
    };
  }
  return match;
}

export function buildResolvedTransferTask(
  task: ApiTask,
  toUser: ApiUser,
  comment: string | undefined,
  requestedByRole: string,
): ResolvedTransferTask {
  return {
    intent: "transfer_task",
    taskId: task.id,
    taskTitle: task.title,
    comment: comment?.trim() || undefined,
    toUserId: toUser.id,
    toUserName: toUser.fullName,
    toUserTelegramId: toUser.telegramId ?? null,
    requestedByRole,
    projectName: task.project?.name,
    currentAssigneeId: task.assigneeId,
  };
}

export function startPendingTaskTransferComment(
  telegramUserId: number,
  task: ApiTask,
  toUser: ApiUser,
): string {
  clearPendingConfirmation(telegramUserId);
  clearPendingTaskSelection(telegramUserId);
  clearPendingTaskStatusDetails(telegramUserId);
  clearPendingTaskCommentDetails(telegramUserId);
  clearPendingTaskMentionDetails(telegramUserId);
  clearPendingTaskTransferComment(telegramUserId);
  setPendingTaskTransferComment(telegramUserId, {
    type: "awaiting_task_transfer_comment",
    taskId: task.id,
    taskTitle: task.title,
    toUserId: toUser.id,
    toUserName: toUser.fullName,
    createdAt: Date.now(),
  });
  return questionForTransferComment(task.title);
}

export async function lookupTaskForTransfer(
  currentUser: ApiUser,
  telegramUserId: number,
  titleQuery: string,
  options?: {
    toUserId: string;
    toUserName: string;
    transferComment?: string;
  },
): Promise<{ ok: true; task: ApiTask } | { ok: false; message: string }> {
  const selectionPayload: TaskSelectionPayload = {
    toUserId: options?.toUserId,
    toUserName: options?.toUserName,
  };
  if (options?.transferComment?.trim()) {
    selectionPayload.transferComment = options.transferComment.trim();
  }

  const resolution = await resolveTaskByTitle(currentUser, titleQuery, "transfer", {
    telegramUserId,
    selectionPayload,
  });

  if (resolution.kind === "found") {
    return { ok: true, task: resolution.task };
  }

  return { ok: false, message: resolveResultToMessage(resolution) };
}

export type SlashTransferResult =
  | { kind: "reply"; message: string }
  | { kind: "confirmation"; resolved: ResolvedTransferTask }
  | { kind: "awaiting_text"; message: string };

export async function handleTransferSlashCommand(
  currentUser: ApiUser,
  telegramUserId: number,
  payload: string,
): Promise<SlashTransferResult> {
  const parsed = parseTransferSlashPayload(payload);
  if (!parsed.taskTitle || !parsed.toUserHint) {
    return {
      kind: "reply",
      message: "Использование: /transfer <задача> | <новый исполнитель> | <комментарий>",
    };
  }

  const users = await fetchUsers();
  const userMatch = resolveTransferTargetUser(users, parsed.toUserHint);
  if (userMatch.kind === "none" || userMatch.kind === "many") {
    return { kind: "reply", message: userMatch.message ?? "Не удалось найти сотрудника." };
  }

  const toUser = userMatch.user;
  const lookup = await lookupTaskForTransfer(
    currentUser,
    telegramUserId,
    parsed.taskTitle,
    {
      toUserId: toUser.id,
      toUserName: toUser.fullName,
      transferComment: parsed.comment,
    },
  );
  if (!lookup.ok) {
    return { kind: "reply", message: lookup.message };
  }

  if (!canModifyTask(currentUser, lookup.task)) {
    return { kind: "reply", message: "Вы не можете передать эту задачу." };
  }

  if (lookup.task.assigneeId === toUser.id) {
    return { kind: "reply", message: "Сотрудник уже назначен на эту задачу." };
  }

  if (requiresTransferApproval(currentUser.role) && !toUser.telegramId) {
    return {
      kind: "reply",
      message: `Нельзя запросить передачу: Telegram у сотрудника ${toUser.fullName} не привязан.`,
    };
  }

  if (!parsed.comment?.trim()) {
    const message = startPendingTaskTransferComment(telegramUserId, lookup.task, toUser);
    return { kind: "awaiting_text", message };
  }

  clearPendingTaskTransferComment(telegramUserId);
  return {
    kind: "confirmation",
    resolved: buildResolvedTransferTask(
      lookup.task,
      toUser,
      parsed.comment,
      currentUser.role,
    ),
  };
}

export async function executeTransferTask(
  api: Api,
  author: ApiUser,
  resolved: ResolvedTransferTask,
): Promise<string> {
  if (requiresTransferApproval(author.role) && !resolved.toUserTelegramId) {
    return `Нельзя запросить передачу: Telegram у сотрудника ${resolved.toUserName} не привязан.`;
  }

  const result = await createTaskTransfer(resolved.taskId, {
    requestedById: author.id,
    toUserId: resolved.toUserId,
    comment: resolved.comment,
  });

  const transfer = result.transfer;
  const task = result.task;
  const commentLabel = resolved.comment?.trim() || "не указан";

  if (transfer.status === "ACCEPTED") {
    try {
      await notifyTransferImmediate(api, {
        taskTitle: task.title,
        projectName: task.project?.name ?? resolved.projectName,
        comment: commentLabel,
        author,
        toUser: {
          id: resolved.toUserId,
          fullName: resolved.toUserName,
          telegramId: resolved.toUserTelegramId,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[task-notifications] transfer immediate error: ${msg}`);
    }

    const base = `Задача передана сотруднику ${resolved.toUserName}: ${task.title}`;
    if (!resolved.toUserTelegramId) {
      return `${base}\n\nTelegram у сотрудника не привязан.`;
    }
    return base;
  }

  if (resolved.toUserTelegramId) {
    const toTelegramNumeric = Number(resolved.toUserTelegramId);
    if (Number.isFinite(toTelegramNumeric)) {
      setPendingTaskTransferDecision(toTelegramNumeric, {
        type: "pending_task_transfer_decision",
        transferId: transfer.id,
        taskId: task.id,
        taskTitle: task.title,
        requestedById: author.id,
        requestedByName: author.fullName,
        toUserId: resolved.toUserId,
        comment: resolved.comment,
        projectName: task.project?.name ?? resolved.projectName,
        createdAt: Date.now(),
      });
    }
  }

  try {
    await notifyTransferPending(api, {
      taskTitle: task.title,
      projectName: task.project?.name ?? resolved.projectName,
      comment: commentLabel,
      author,
      toUser: {
        id: resolved.toUserId,
        fullName: resolved.toUserName,
        telegramId: resolved.toUserTelegramId,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[task-notifications] transfer pending error: ${msg}`);
  }

  return `Запрос на передачу задачи отправлен сотруднику ${resolved.toUserName}.`;
}

export async function executeAcceptTransfer(
  api: Api,
  accepter: ApiUser,
  transferId: string,
  pending: { taskTitle: string; requestedById: string; requestedByName: string },
): Promise<string> {
  const result = await acceptTaskTransfer(transferId, { userId: accepter.id });
  const task = result.task;

  try {
    await notifyTransferAccepted(api, {
      taskTitle: task.title,
      toUserName: accepter.fullName,
      requestedById: pending.requestedById,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[task-notifications] transfer accepted error: ${msg}`);
  }

  return `Задача принята: ${task.title}.`;
}

export async function executeRejectTransfer(
  api: Api,
  rejector: ApiUser,
  transferId: string,
  rejectionReason: string,
  pending: { taskTitle: string; requestedById: string },
): Promise<string> {
  const result = await rejectTaskTransfer(transferId, {
    userId: rejector.id,
    rejectionReason,
  });
  const task = result.task;

  try {
    await notifyTransferRejected(api, {
      taskTitle: task.title,
      toUserName: rejector.fullName,
      requestedById: pending.requestedById,
      rejectionReason,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[task-notifications] transfer rejected error: ${msg}`);
  }

  return `Отказ по задаче «${task.title}» отправлен.`;
}

export function transferPreviewNote(requestedByRole: string): string {
  if (isManagerOrOwner(requestedByRole)) {
    return "Задача будет передана сразу.";
  }
  return "Новый исполнитель должен будет принять задачу.";
}
