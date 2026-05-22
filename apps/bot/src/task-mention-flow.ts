import type { Api } from "grammy";
import type { ApiTask, ApiUser } from "./api";
import {
  createTaskCommentMention,
  fetchUsers,
  findUserByNameHint,
  type UserNameMatchResult,
} from "./api";
import type { ResolvedMentionInTask } from "./intent-resolver";
import { clearPendingConfirmation } from "./pending-intent";
import {
  clearPendingTaskCommentDetails,
} from "./pending-task-comment-details";
import {
  clearPendingTaskMentionDetails,
  setPendingTaskMentionDetails,
} from "./pending-task-mention-details";
import { clearPendingTaskSelection } from "./pending-task-selection";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";
import type { TaskSelectionPayload } from "./pending-task-selection";
import { canModifyTask } from "./task-status-flow";
import { notifyTaskMentionRequested } from "./task-notifications";

const MENTION_PARTS_RE = /\s*(?:\||—|–|-)\s*/u;

export function parseMentionSlashPayload(payload: string): {
  userHint?: string;
  taskTitle?: string;
  text?: string;
} {
  const trimmed = payload.trim();
  if (!trimmed) return {};

  const parts = trimmed.split(MENTION_PARTS_RE).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return {};

  return {
    userHint: parts[0],
    taskTitle: parts[1],
    text: parts.slice(2).join(" — "),
  };
}

export function questionForMentionText(userName: string, taskTitle: string): string {
  return `Что написать в комментарии для ${userName} по задаче «${taskTitle}»?`;
}

export function resolveMentionedUser(
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

export function buildResolvedMentionInTask(
  task: ApiTask,
  mentionedUser: ApiUser,
  text: string,
): ResolvedMentionInTask {
  return {
    intent: "mention_in_task",
    taskId: task.id,
    taskTitle: task.title,
    text: text.trim(),
    mentionedUserId: mentionedUser.id,
    mentionedUserName: mentionedUser.fullName,
    mentionedUserTelegramId: mentionedUser.telegramId ?? null,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    projectName: task.project?.name,
  };
}

export function startPendingTaskMentionDetails(
  telegramUserId: number,
  task: ApiTask,
  mentionedUser: ApiUser,
): string {
  clearPendingConfirmation(telegramUserId);
  clearPendingTaskSelection(telegramUserId);
  clearPendingTaskStatusDetails(telegramUserId);
  clearPendingTaskCommentDetails(telegramUserId);
  setPendingTaskMentionDetails(telegramUserId, {
    type: "awaiting_task_mention_text",
    taskId: task.id,
    taskTitle: task.title,
    mentionedUserId: mentionedUser.id,
    mentionedUserName: mentionedUser.fullName,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    createdAt: Date.now(),
  });
  return questionForMentionText(mentionedUser.fullName, task.title);
}

export type TaskMentionLookupResult =
  | { ok: true; task: ApiTask }
  | { ok: false; message: string };

export async function lookupTaskForMention(
  currentUser: ApiUser,
  telegramUserId: number,
  titleQuery: string,
  options?: {
    mentionedUserId: string;
    mentionedUserName: string;
    mentionText?: string;
  },
): Promise<TaskMentionLookupResult> {
  const selectionPayload: TaskSelectionPayload = {
    mentionedUserId: options?.mentionedUserId,
    mentionedUserName: options?.mentionedUserName,
  };
  if (options?.mentionText?.trim()) {
    selectionPayload.mentionText = options.mentionText.trim();
  }

  const resolution = await resolveTaskByTitle(currentUser, titleQuery, "mention", {
    telegramUserId,
    selectionPayload,
  });

  if (resolution.kind === "found") {
    return { ok: true, task: resolution.task };
  }

  return { ok: false, message: resolveResultToMessage(resolution) };
}

export type SlashMentionResult =
  | { kind: "reply"; message: string }
  | { kind: "confirmation"; resolved: ResolvedMentionInTask }
  | { kind: "awaiting_text"; message: string };

export async function handleMentionSlashCommand(
  currentUser: ApiUser,
  telegramUserId: number,
  payload: string,
): Promise<SlashMentionResult> {
  const parsed = parseMentionSlashPayload(payload);
  if (!parsed.userHint || !parsed.taskTitle) {
    return {
      kind: "reply",
      message: "Использование: /mention <сотрудник> | <задача> | <комментарий>",
    };
  }

  const users = await fetchUsers();
  const userMatch = resolveMentionedUser(users, parsed.userHint);
  if (userMatch.kind === "none" || userMatch.kind === "many") {
    return { kind: "reply", message: userMatch.message ?? "Не удалось найти сотрудника." };
  }

  const mentionedUser = userMatch.user;
  const lookup = await lookupTaskForMention(
    currentUser,
    telegramUserId,
    parsed.taskTitle,
    {
      mentionedUserId: mentionedUser.id,
      mentionedUserName: mentionedUser.fullName,
      mentionText: parsed.text,
    },
  );
  if (!lookup.ok) {
    return { kind: "reply", message: lookup.message };
  }

  if (!canModifyTask(currentUser, lookup.task)) {
    return { kind: "reply", message: "Вы не можете комментировать эту задачу." };
  }

  if (!parsed.text?.trim()) {
    const message = startPendingTaskMentionDetails(
      telegramUserId,
      lookup.task,
      mentionedUser,
    );
    return { kind: "awaiting_text", message };
  }

  clearPendingTaskMentionDetails(telegramUserId);
  return {
    kind: "confirmation",
    resolved: buildResolvedMentionInTask(lookup.task, mentionedUser, parsed.text),
  };
}

export async function executeMentionInTask(
  api: Api,
  author: ApiUser,
  resolved: ResolvedMentionInTask,
): Promise<string> {
  if (!resolved.text.trim()) {
    return "Укажите текст комментария.";
  }

  const result = await createTaskCommentMention(resolved.taskId, {
    authorId: author.id,
    mentionedUserId: resolved.mentionedUserId,
    text: resolved.text,
    source: "TELEGRAM_TEXT",
  });

  let notifyOk = false;
  try {
    notifyOk = await notifyTaskMentionRequested(api, {
      taskTitle: resolved.taskTitle,
      projectName: result.task.project?.name ?? resolved.projectName,
      text: resolved.text,
      author,
      mentionedUser: {
        id: result.mentionedUser.id,
        fullName: result.mentionedUser.fullName,
        telegramId: result.mentionedUser.telegramId,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[task-notifications] mention notify error: ${msg}`);
  }

  const invited = `${resolved.mentionedUserName} приглашён в задачу «${resolved.taskTitle}».`;
  if (!notifyOk && !result.mentionedUser.telegramId) {
    return `${invited}, но Telegram у сотрудника не привязан.`;
  }
  return invited;
}
