import type { Context } from "grammy";
import { callbackLogContext, errorMessage, errorName } from "./callback-log";

type AnswerCallbackOptions = Parameters<Context["answerCallbackQuery"]>[0];

function isExpiredOrInvalidCallbackAnswer(error: unknown): boolean {
  const msg = errorMessage(error).toLowerCase();
  return (
    msg.includes("query is too old") ||
    msg.includes("response timeout expired") ||
    msg.includes("query id is invalid")
  );
}

export async function safeAnswerCallbackQuery(
  ctx: Context,
  options?: AnswerCallbackOptions,
): Promise<boolean> {
  try {
    await ctx.answerCallbackQuery(options);
    return true;
  } catch (error) {
    const expired = isExpiredOrInvalidCallbackAnswer(error);
    console.warn(
      expired ? "[bot] callback answer expired/invalid" : "[bot] callback answer failed",
      {
        ...callbackLogContext(ctx),
        errorName: errorName(error),
        errorMessage: errorMessage(error),
      },
    );
    return false;
  }
}
