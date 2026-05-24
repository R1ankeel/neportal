import { peelTransferTrailingComment, isTransferLikeCommand } from "./transfer-query-parse";

/** Восстанавливает comment для transfer/reassign из userText, если LLM его не вернул. */
export function applyTransferTaskCommentFix(
  payload: Record<string, unknown>,
  userText: string | undefined,
): void {
  if (!userText?.trim()) return;
  if (typeof payload.comment === "string" && payload.comment.trim().length > 0) {
    return;
  }

  if (!isTransferLikeCommand(userText)) return;

  const { comment } = peelTransferTrailingComment(userText);
  if (comment?.trim()) {
    payload.comment = comment.trim();
  }
}
