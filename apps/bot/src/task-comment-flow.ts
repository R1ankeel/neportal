import type { Api } from "grammy";
import type { ApiTask, ApiUser } from "./api";
import { createTaskComment, createTaskCommentMention } from "./api";
import type { ResolvedAddTaskComment } from "./intent-resolver";
import { clearPendingConfirmation } from "./pending-intent";
import {
  clearPendingTaskCommentDetails,
  setPendingTaskCommentDetails,
} from "./pending-task-comment-details";
import { clearPendingTaskMentionDetails } from "./pending-task-mention-details";
import { clearPendingTaskSelection } from "./pending-task-selection";
import { clearPendingTaskStatusDetails } from "./pending-task-status-details";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";
import type { TaskSelectionPayload } from "./pending-task-selection";
import { canModifyTask, parseTaskTitleAndSuffix } from "./task-status-flow";
import { notifyTaskCommentAdded, notifyTaskMentionRequested } from "./task-notifications";

export { canModifyTask as canCommentTask };

export function questionForMissingComment(): string {
  return "Какой комментарий добавить?";
}

export function questionForCommentText(taskTitle: string): string {
  return `Что написать в комментарии к задаче «${taskTitle}»?`;
}

export function buildResolvedAddTaskComment(
  task: ApiTask,
  text: string,
): ResolvedAddTaskComment {
  return {
    intent: "add_task_comment",
    taskId: task.id,
    taskTitle: task.title,
    text: text.trim(),
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    projectName: task.project?.name,
  };
}

/** Builds a resolved comment that includes a user mention. */
export function buildResolvedAddTaskCommentWithMention(
  task: ApiTask,
  text: string,
  mentionedUser: ApiUser,
): ResolvedAddTaskComment {
  return {
    intent: "add_task_comment",
    taskId: task.id,
    taskTitle: task.title,
    text: text.trim(),
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    mentionedUserId: mentionedUser.id,
    mentionedUserName: mentionedUser.fullName,
    mentionedUserTelegramId: mentionedUser.telegramId ?? null,
    projectName: task.project?.name,
  };
}

export function startPendingTaskCommentDetails(
  telegramUserId: number,
  task: ApiTask,
): string {
  clearPendingConfirmation(telegramUserId);
  clearPendingTaskSelection(telegramUserId);
  clearPendingTaskStatusDetails(telegramUserId);
  clearPendingTaskMentionDetails(telegramUserId);
  setPendingTaskCommentDetails(telegramUserId, {
    type: "awaiting_task_comment_text",
    taskId: task.id,
    taskTitle: task.title,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    createdAt: Date.now(),
  });
  return questionForMissingComment();
}

export type TaskCommentLookupResult =
  | { ok: true; task: ApiTask }
  | { ok: false; message: string };

export async function lookupTaskForComment(
  currentUser: ApiUser,
  telegramUserId: number,
  titleQuery: string,
  options?: { commentText?: string },
): Promise<TaskCommentLookupResult> {
  const selectionPayload: TaskSelectionPayload = {};
  if (options?.commentText?.trim()) {
    selectionPayload.commentText = options.commentText.trim();
  }

  const resolution = await resolveTaskByTitle(currentUser, titleQuery, "comment", {
    telegramUserId,
    selectionPayload,
  });

  if (resolution.kind === "found") {
    return { ok: true, task: resolution.task };
  }

  return { ok: false, message: resolveResultToMessage(resolution) };
}

export type SlashTaskCommentResult =
  | { kind: "reply"; message: string }
  | { kind: "confirmation"; resolved: ResolvedAddTaskComment }
  | { kind: "awaiting_text"; message: string };

export async function handleCommentSlashCommand(
  currentUser: ApiUser,
  telegramUserId: number,
  payload: string,
): Promise<SlashTaskCommentResult> {
  const trimmed = payload.trim();
  if (!trimmed) {
    return {
      kind: "reply",
      message: "Использование: /comment <задача> — <комментарий>",
    };
  }

  const { title, suffix } = parseTaskTitleAndSuffix(payload);
  if (!title) {
    return {
      kind: "reply",
      message: "Использование: /comment <задача> — <комментарий>",
    };
  }

  const lookup = await lookupTaskForComment(currentUser, telegramUserId, title, {
    commentText: suffix,
  });
  if (!lookup.ok) {
    return { kind: "reply", message: lookup.message };
  }

  if (!suffix?.trim()) {
    const message = startPendingTaskCommentDetails(telegramUserId, lookup.task);
    return { kind: "awaiting_text", message };
  }

  clearPendingTaskCommentDetails(telegramUserId);
  return {
    kind: "confirmation",
    resolved: buildResolvedAddTaskComment(lookup.task, suffix),
  };
}

export async function executeTaskComment(
  api: Api,
  author: ApiUser,
  resolved: ResolvedAddTaskComment,
): Promise<string> {
  if (!resolved.text.trim()) {
    return "Укажите текст комментария.";
  }

  let commentId: string | undefined;

  if (resolved.mentionedUserId) {
    const result = await createTaskCommentMention(resolved.taskId, {
      authorId: author.id,
      mentionedUserId: resolved.mentionedUserId,
      text: resolved.text,
      source: "TELEGRAM_TEXT",
    });
    commentId = result.comment.id;
  } else {
    const result = await createTaskComment(resolved.taskId, {
      authorId: author.id,
      text: resolved.text,
      source: "TELEGRAM_TEXT",
    });
    commentId = result.id;
  }

  try {
    await notifyTaskCommentAdded(api, resolved, author, commentId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[task-notifications] comment notify error: ${msg}`);
  }

  if (resolved.mentionedUserId && resolved.mentionedUserName) {
    try {
      await notifyTaskMentionRequested(api, {
        taskId: resolved.taskId,
        taskTitle: resolved.taskTitle,
        projectName: resolved.projectName,
        text: resolved.text,
        author,
        mentionedUser: {
          id: resolved.mentionedUserId,
          fullName: resolved.mentionedUserName,
          telegramId: resolved.mentionedUserTelegramId ?? null,
        },
        commentId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[task-notifications] mention notify error: ${msg}`);
    }
  }

  return `Комментарий добавлен к задаче «${resolved.taskTitle}».`;
}
