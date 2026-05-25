import type { Api } from "grammy";
import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiTask, ApiUser } from "./api";
import { createTaskTransfer, fetchUsers } from "./api";
import type { ResolvedReassignTask } from "./intent-resolver";
import { replyWithIntentPreview } from "./intent-preview";
import { clearPendingConfirmation, setPendingConfirmation } from "./pending-intent";
import {
  apiUserToCandidate,
  startPendingUserSelection,
} from "./pending-user-selection";
import type { ReassignUserSelectionPayload } from "./pending-user-selection";
import { formatUserCandidates } from "./user-selection-format";
import { userNotFoundMessage } from "./user-selection-format";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";
import { isManagerOrOwner } from "./task-transfer-flow";
import { notifyReassign } from "./task-notifications";
import { resolveUserByHint } from "./user-hint-resolution";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";

const REASSIGN_PARTS_RE = /\s*(?:\||—|–|-)\s*/u;

export const MANAGER_REASSIGN_ONLY_MESSAGE =
  "Только руководитель или менеджер может менять задачи сотрудников.";

export function parseReassignSlashPayload(payload: string): {
  taskTitle?: string;
  fromUserHint?: string;
  toUserHint?: string;
  comment?: string;
} {
  const trimmed = payload.trim();
  if (!trimmed) return {};

  const parts = trimmed.split(REASSIGN_PARTS_RE).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return {};

  if (parts.length === 2) {
    return { taskTitle: parts[0], toUserHint: parts[1] };
  }
  if (parts.length === 3) {
    return {
      taskTitle: parts[0],
      fromUserHint: parts[1],
      toUserHint: parts[2],
    };
  }

  return {
    taskTitle: parts[0],
    fromUserHint: parts[1],
    toUserHint: parts[2],
    comment: parts.slice(3).join(" — "),
  };
}

export function buildResolvedReassignTask(
  task: ApiTask,
  toUser: ApiUser,
  comment: string | undefined,
  fromUserId?: string,
  fromUserName?: string,
): ResolvedReassignTask {
  return {
    intent: "reassign_task",
    taskId: task.id,
    taskTitle: task.title,
    comment: comment?.trim() || undefined,
    toUserId: toUser.id,
    toUserName: toUser.fullName,
    toUserTelegramId: toUser.telegramId ?? null,
    fromUserId,
    fromUserName,
    currentAssigneeId: task.assigneeId,
    currentAssigneeName: task.assignee?.fullName ?? null,
    creatorId: task.creatorId,
    projectName: task.project?.name,
  };
}

export function assigneeMismatchMessage(
  taskTitle: string,
  fromUserName: string,
  actualAssigneeName: string,
): string {
  return `Задача «${taskTitle}» сейчас назначена не на ${fromUserName}, а на ${actualAssigneeName}.`;
}

export function noTaskForAssigneeMessage(taskTitle: string, fromUserName: string): string {
  return `Не нашёл активную задачу «${taskTitle}» у сотрудника ${fromUserName}.`;
}

export async function continueReassignAfterUsersResolved(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
  taskTitle: string,
  toUser: ApiUser,
  options: {
    fromUser?: ApiUser;
    comment?: string;
  },
): Promise<void> {
  if (intent.intent !== "reassign_task") {
    return;
  }

  const comment = options.comment ?? intent.payload.comment;
  const fromUser = options.fromUser;

  const taskSelectionPayload = {
    fromUserId: fromUser?.id,
    fromUserName: fromUser?.fullName,
    toUserId: toUser.id,
    toUserName: toUser.fullName,
    reassignComment: comment?.trim(),
  };

  const resolution = await resolveTaskByTitle(linked, taskTitle, "reassign", {
    telegramUserId,
    selectionPayload: taskSelectionPayload,
    assigneeFilterUserId: fromUser?.id,
    assigneeFilterUserName: fromUser?.fullName,
  });

  if (resolution.kind !== "found") {
    await replyWithActiveChoiceKeyboard(ctx, telegramUserId, resolveResultToMessage(resolution));
    return;
  }

  const task = resolution.task;

  if (fromUser && task.assigneeId !== fromUser.id) {
    const actualName = task.assignee?.fullName ?? "не назначен";
    await ctx.reply(assigneeMismatchMessage(task.title, fromUser.fullName, actualName));
    return;
  }

  if (task.assigneeId === toUser.id) {
    await ctx.reply("Сотрудник уже назначен на эту задачу.");
    return;
  }

  const resolved = buildResolvedReassignTask(
    task,
    toUser,
    comment,
    fromUser?.id,
    fromUser?.fullName,
  );

  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent,
    resolved,
  });
  await replyWithIntentPreview(ctx, telegramUserId, resolved);
}

export type SlashReassignResult =
  | { kind: "reply"; message: string }
  | { kind: "confirmation"; resolved: ResolvedReassignTask }
  | { kind: "user_selection_started" };

export async function handleReassignSlashCommand(
  currentUser: ApiUser,
  telegramUserId: number,
  payload: string,
  ctx?: Context,
): Promise<SlashReassignResult> {
  if (!isManagerOrOwner(currentUser.role)) {
    return { kind: "reply", message: MANAGER_REASSIGN_ONLY_MESSAGE };
  }

  const parsed = parseReassignSlashPayload(payload);
  if (!parsed.taskTitle || !parsed.toUserHint) {
    return {
      kind: "reply",
      message:
        "Использование: /reassign <задача> | <старый исполнитель?> | <новый исполнитель> | <комментарий>",
    };
  }

  const users = await fetchUsers();
  let fromUser: ApiUser | undefined;

  if (parsed.fromUserHint?.trim()) {
    const fromMatch = resolveUserByHint(users, parsed.fromUserHint, currentUser);
    if (fromMatch.kind === "none") {
      return { kind: "reply", message: userNotFoundMessage(parsed.fromUserHint) };
    }
    if (fromMatch.kind === "many") {
      if (!ctx) {
        return { kind: "reply", message: "Нашёл несколько сотрудников. Уточните ФИО." };
      }
      const selectionPayload: ReassignUserSelectionPayload = {
        intent: "reassign_task",
        taskTitle: parsed.taskTitle,
        comment: parsed.comment,
        toUserHint: parsed.toUserHint,
      };
      startPendingUserSelection(
        telegramUserId,
        "select_user_for_reassign_from",
        fromMatch.users.map(apiUserToCandidate),
        selectionPayload,
      );
      await replyWithActiveChoiceKeyboard(
        ctx,
        telegramUserId,
        formatUserCandidates(fromMatch.users.map(apiUserToCandidate)),
      );
      return { kind: "user_selection_started" };
    }
    fromUser = fromMatch.user;
  }

  const toMatch = resolveUserByHint(users, parsed.toUserHint, currentUser);
  if (toMatch.kind === "none") {
    return { kind: "reply", message: userNotFoundMessage(parsed.toUserHint) };
  }
  if (toMatch.kind === "many") {
    if (!ctx) {
      return { kind: "reply", message: "Нашёл несколько сотрудников. Уточните ФИО." };
    }
    const selectionPayload: ReassignUserSelectionPayload = {
      intent: "reassign_task",
      taskTitle: parsed.taskTitle,
      comment: parsed.comment,
      fromUserId: fromUser?.id,
      fromUserName: fromUser?.fullName,
      toUserHint: parsed.toUserHint,
    };
    startPendingUserSelection(
      telegramUserId,
      "select_user_for_reassign_to",
      toMatch.users.map(apiUserToCandidate),
      selectionPayload,
    );
    await replyWithActiveChoiceKeyboard(
      ctx,
      telegramUserId,
      formatUserCandidates(toMatch.users.map(apiUserToCandidate)),
    );
    return { kind: "user_selection_started" };
  }

  const toUser = toMatch.user;
  const taskSelectionPayload = {
    fromUserId: fromUser?.id,
    fromUserName: fromUser?.fullName,
    toUserId: toUser.id,
    toUserName: toUser.fullName,
    reassignComment: parsed.comment?.trim(),
  };

  const resolution = await resolveTaskByTitle(currentUser, parsed.taskTitle, "reassign", {
    telegramUserId,
    selectionPayload: taskSelectionPayload,
    assigneeFilterUserId: fromUser?.id,
    assigneeFilterUserName: fromUser?.fullName,
  });

  if (resolution.kind !== "found") {
    return { kind: "reply", message: resolveResultToMessage(resolution) };
  }

  const task = resolution.task;

  if (fromUser && task.assigneeId !== fromUser.id) {
    const actualName = task.assignee?.fullName ?? "не назначен";
    return {
      kind: "reply",
      message: assigneeMismatchMessage(task.title, fromUser.fullName, actualName),
    };
  }

  if (task.assigneeId === toUser.id) {
    return { kind: "reply", message: "Сотрудник уже назначен на эту задачу." };
  }

  clearPendingConfirmation(telegramUserId);
  return {
    kind: "confirmation",
    resolved: buildResolvedReassignTask(
      task,
      toUser,
      parsed.comment,
      fromUser?.id,
      fromUser?.fullName,
    ),
  };
}

export async function executeReassignTask(
  api: Api,
  author: ApiUser,
  resolved: ResolvedReassignTask,
): Promise<string> {
  if (!isManagerOrOwner(author.role)) {
    return MANAGER_REASSIGN_ONLY_MESSAGE;
  }

  const result = await createTaskTransfer(resolved.taskId, {
    requestedById: author.id,
    toUserId: resolved.toUserId,
    comment: resolved.comment,
  });

  const transfer = result.transfer;
  const task = result.task;
  const commentLabel = resolved.comment?.trim() || "не указан";

  if (transfer.status !== "ACCEPTED") {
    return "Не удалось переназначить задачу. Повторите позже.";
  }

  const users = await fetchUsers();
  const oldAssigneeId = resolved.currentAssigneeId;
  const oldAssignee = oldAssigneeId ? users.find((u) => u.id === oldAssigneeId) : undefined;
  const creator = users.find((u) => u.id === resolved.creatorId);

  try {
    await notifyReassign(api, {
      taskTitle: task.title,
      projectName: task.project?.name ?? resolved.projectName,
      comment: commentLabel,
      author,
      toUser: {
        id: resolved.toUserId,
        fullName: resolved.toUserName,
        telegramId: resolved.toUserTelegramId,
      },
      oldAssignee: oldAssignee
        ? {
            id: oldAssignee.id,
            fullName: oldAssignee.fullName,
            telegramId: oldAssignee.telegramId ?? null,
          }
        : null,
      creator: creator
        ? {
            id: creator.id,
            fullName: creator.fullName,
            telegramId: creator.telegramId ?? null,
          }
        : null,
      oldAssigneeName: resolved.currentAssigneeName,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[task-notifications] reassign error: ${msg}`);
  }

  const base = `Задача переназначена на ${resolved.toUserName}: ${task.title}`;
  if (!resolved.toUserTelegramId) {
    return `${base}\n\nTelegram у сотрудника не привязан.`;
  }
  return base;
}
