import type { BotError, Context } from "grammy";
import { callbackDataPreview } from "./telegram/callback-log";
import { sanitizeLogString, stringifyAndSanitize } from "./telegram/log-sanitizer";

function updateType(ctx: Context): string {
  if (ctx.callbackQuery) return "callback_query";
  if (ctx.message) return "message";
  if (ctx.inlineQuery) return "inline_query";
  return "unknown";
}

export function logBotMiddlewareError(error: BotError<Context>): void {
  const err = error.error;
  const errorMessage = sanitizeLogString(err instanceof Error ? err.message : String(err));
  const stack = sanitizeLogString(err instanceof Error ? err.stack ?? "" : "");
  const errorDetails = stringifyAndSanitize(err);
  const base = {
    updateId: error.ctx.update.update_id,
    updateType: updateType(error.ctx),
    userId: error.ctx.from?.id ?? null,
    chatId: error.ctx.chat?.id ?? null,
    callbackData: callbackDataPreview(error.ctx.callbackQuery?.data),
    errorName: err instanceof Error ? err.name : typeof err,
    errorMessage,
    errorDetails,
  };

  if (process.env.BOT_DEV_LOG === "0") {
    console.error("[bot] middleware error", base);
    return;
  }

  console.error("[bot] middleware error", {
    ...base,
    stack: stack || undefined,
  });
}
