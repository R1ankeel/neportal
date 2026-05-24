import { validateAddTaskCommentPayload } from "./validate-add-task-comment-payload";

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

/** Нормализует payload add_task_comment до Zod-валидации. */
export function applyAddTaskCommentPayloadFix(
  p: Record<string, unknown>,
  userText?: string,
): void {
  const legacyText = asTrimmedString(p.text);
  const comment = asTrimmedString(p.comment);
  const { payload } = validateAddTaskCommentPayload({
    payload: {
      taskQuery: asTrimmedString(p.taskQuery),
      taskTitle: asTrimmedString(p.taskTitle),
      taskId: asTrimmedString(p.taskId),
      comment: comment ?? legacyText,
      text: legacyText,
    },
    userText: userText?.trim() ?? "",
  });

  delete p.text;
  if (payload.taskQuery) p.taskQuery = payload.taskQuery;
  else delete p.taskQuery;
  if (payload.taskTitle) p.taskTitle = payload.taskTitle;
  else delete p.taskTitle;
  if (payload.taskId) p.taskId = payload.taskId;
  else delete p.taskId;
  if (payload.comment) p.comment = payload.comment;
  else delete p.comment;
}
