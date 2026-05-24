import { splitCommentByExplicitSeparator } from "./ai/deterministic/split-comment-by-explicit-separator";

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
  if (!comment && legacyText) {
    p.comment = legacyText;
  }
  delete p.text;

  const user = userText?.trim() ?? "";
  const currentComment = asTrimmedString(p.comment);
  const commentLooksLikeFullMessage =
    Boolean(user) && Boolean(currentComment) && currentComment === user;

  if (!currentComment || commentLooksLikeFullMessage) {
    if (!user) return;

    const split = splitCommentByExplicitSeparator(user);
    if (!split) return;

    if (split.comment && (!currentComment || commentLooksLikeFullMessage)) {
      p.comment = split.comment;
    }

    const taskQuery = asTrimmedString(p.taskQuery);
    const taskTitle = asTrimmedString(p.taskTitle);
    if (split.taskQuery && !taskQuery) {
      p.taskQuery = split.taskQuery;
      if (!taskTitle || taskTitle === user || taskTitle === split.taskQuery) {
        p.taskTitle = split.taskQuery;
      }
    }
  }
}
