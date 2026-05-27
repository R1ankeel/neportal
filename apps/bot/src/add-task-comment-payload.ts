import type { AiIntent } from "./ai-contracts";

export type AddTaskCommentPayload = Extract<
  AiIntent,
  { intent: "add_task_comment" }
>["payload"];

export function getAddTaskCommentTaskQuery(
  payload: AddTaskCommentPayload,
): string | undefined {
  const q = payload.taskQuery?.trim() || payload.taskTitle?.trim();
  return q || undefined;
}

export function getAddTaskCommentComment(
  payload: AddTaskCommentPayload,
): string | undefined {
  const c = payload.comment?.trim() || payload.text?.trim();
  return c || undefined;
}

export function buildAddTaskCommentPayload(
  partial: {
    taskQuery?: string;
    taskTitle?: string;
    comment?: string;
    text?: string;
    mentionedUserId?: string;
    mentionUserHints?: string[];
  },
): AddTaskCommentPayload {
  const taskQuery = partial.taskQuery?.trim();
  const taskTitle = partial.taskTitle?.trim();
  const comment = partial.comment?.trim() || partial.text?.trim();
  const payload: AddTaskCommentPayload = {};
  if (taskQuery) payload.taskQuery = taskQuery;
  if (taskTitle) payload.taskTitle = taskTitle;
  if (comment) payload.comment = comment;
  if (partial.mentionedUserId) payload.mentionedUserId = partial.mentionedUserId;
  const hints = partial.mentionUserHints?.map((h) => h.trim()).filter(Boolean);
  if (hints && hints.length > 0) payload.mentionUserHints = hints;
  return payload;
}
