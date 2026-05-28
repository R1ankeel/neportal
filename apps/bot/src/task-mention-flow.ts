import type { Api } from "grammy";
import type { ApiTask, ApiUser } from "./api";
import {
  createTaskCommentMention,
  fetchUsers,
  type UserNameMatchResult,
} from "./api";
import { resolveUserByHint } from "./user-hint-resolution";
import { userNotFoundMessage } from "./user-selection-format";
import {
  apiUserToCandidate,
  startPendingUserSelection,
} from "./pending-user-selection";
import { formatUserCandidates } from "./user-selection-format";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";
import type { Context } from "grammy";
import type { ResolvedMentionInTask } from "./intent-resolver";
import { clearPendingConfirmation } from "./pending-intent";
import {
  clearPendingTaskCommentDetails,
} from "./pending-task-comment-details";
import {
  clearPendingTaskMentionDetails,
  setPendingTaskMentionDetails,
} from "./pending-task-mention-details";
import { clearPendingMentionAddToProject } from "./pending-mention-add-to-project";
import { clearPendingTaskSelection } from "./pending-task-selection";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";
import type { TaskSelectionPayload } from "./pending-task-selection";
import { canModifyTask } from "./task-status-flow";
import { notifyTaskMentionRequested } from "./task-notifications";
import { gateMentionProjectMembership } from "./mention-project-membership";

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
  currentUser: ApiUser | null,
): UserNameMatchResult & { message?: string } {
  const match = resolveUserByHint(users, hint, currentUser);
  if (match.kind === "none") {
    return {
      kind: "none",
      message: userNotFoundMessage(hint),
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
  clearPendingMentionAddToProject(telegramUserId);
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
  | { kind: "awaiting_text"; message: string }
  | { kind: "user_selection_started" }
  | { kind: "handled" };

export async function handleMentionSlashCommand(
  currentUser: ApiUser,
  telegramUserId: number,
  payload: string,
  ctx?: Context,
): Promise<SlashMentionResult> {
  const parsed = parseMentionSlashPayload(payload);
  if (!parsed.userHint || !parsed.taskTitle) {
    return {
      kind: "reply",
      message: "Использование: /mention <сотрудник> | <задача> | <комментарий>",
    };
  }

  const users = await fetchUsers();
  const userMatch = resolveMentionedUser(users, parsed.userHint, currentUser);
  if (userMatch.kind === "none") {
    return { kind: "reply", message: userMatch.message ?? "Не удалось найти сотрудника." };
  }
  if (userMatch.kind === "many") {
    if (!ctx) {
      return {
        kind: "reply",
        message: "Нашёл несколько сотрудников. Уточните ФИО.",
      };
    }
    startPendingUserSelection(
      telegramUserId,
      "select_user_for_mention",
      userMatch.users.map(apiUserToCandidate),
      {
        intent: "mention_in_task",
        taskTitle: parsed.taskTitle,
        text: parsed.text,
      },
    );
    await replyWithActiveChoiceKeyboard(
      ctx,
      telegramUserId,
      formatUserCandidates(userMatch.users.map(apiUserToCandidate)),
    );
    return { kind: "user_selection_started" };
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
    if (ctx) {
      const resolvedWithoutText = buildResolvedMentionInTask(
        lookup.task,
        mentionedUser,
        "",
      );
      const canProceed = await gateMentionProjectMembership(
        ctx,
        telegramUserId,
        currentUser,
        lookup.task,
        mentionedUser,
        resolvedWithoutText,
        "mention_in_task",
        "awaiting_text",
      );
      if (!canProceed) return { kind: "handled" };
    }

    const message = startPendingTaskMentionDetails(
      telegramUserId,
      lookup.task,
      mentionedUser,
    );
    return { kind: "awaiting_text", message };
  }

  const resolved = buildResolvedMentionInTask(lookup.task, mentionedUser, parsed.text);
  if (ctx) {
    const canProceed = await gateMentionProjectMembership(
      ctx,
      telegramUserId,
      currentUser,
      lookup.task,
      mentionedUser,
      resolved,
      "mention_in_task",
      "preview",
    );
    if (!canProceed) return { kind: "handled" };
  }

  clearPendingTaskMentionDetails(telegramUserId);
  return {
    kind: "confirmation",
    resolved,
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

  const commentId = result.comment.id;

  let notifyOk = false;
  try {
    notifyOk = await notifyTaskMentionRequested(api, {
      taskId: resolved.taskId,
      taskTitle: resolved.taskTitle,
      projectName: result.task.project?.name ?? resolved.projectName,
      text: resolved.text,
      author,
      mentionedUser: {
        id: result.mentionedUser.id,
        fullName: result.mentionedUser.fullName,
        telegramId: result.mentionedUser.telegramId,
      },
      commentId,
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
