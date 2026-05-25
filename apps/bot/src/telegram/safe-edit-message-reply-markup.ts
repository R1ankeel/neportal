import type { Context } from "grammy";
import { callbackLogContext, errorMessage, errorName } from "./callback-log";

type EditReplyMarkupOptions = Parameters<Context["editMessageReplyMarkup"]>[0];

export async function safeEditMessageReplyMarkup(
  ctx: Context,
  options?: EditReplyMarkupOptions,
): Promise<boolean> {
  try {
    await ctx.editMessageReplyMarkup(options);
    return true;
  } catch (error) {
    console.warn("[bot] callback edit reply markup failed", {
      ...callbackLogContext(ctx),
      errorName: errorName(error),
      errorMessage: errorMessage(error),
    });
    return false;
  }
}
