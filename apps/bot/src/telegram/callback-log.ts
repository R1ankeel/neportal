import type { Context } from "grammy";

export function callbackDataPreview(data: string | undefined): string | undefined {
  if (!data) return undefined;
  const parts = data.split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0];
}

export function callbackLogContext(ctx: Context): Record<string, unknown> {
  const message = ctx.callbackQuery?.message;
  return {
    callbackData: callbackDataPreview(ctx.callbackQuery?.data),
    userId: ctx.from?.id ?? null,
    chatId: message?.chat.id ?? null,
    messageId: message?.message_id ?? null,
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
