import type { Context } from "grammy";
import { isConfirmationNo, isConfirmationYes } from "./confirmation";
import { executeResolvedIntent } from "./intent-executor";
import { buildIntentPreview } from "./intent-preview";
import { resolveIntent } from "./intent-resolver";
import {
  clearPendingConfirmation,
  getPendingConfirmation,
  setPendingConfirmation,
} from "./pending-intent";
import { handleLinkByUsernameConfirmation } from "./start-binding";
import { getYandexGptState, parseTextIntent } from "./yandex-gpt";

const CONFIDENCE_THRESHOLD = 0.7;

export async function handlePlainTextMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text?.trim();
  const telegramUserId = ctx.from?.id;
  if (!text || !telegramUserId) return;

  const pending = getPendingConfirmation(telegramUserId);
  if (pending) {
    if (pending.type === "confirm_link_by_username") {
      await handleLinkByUsernameConfirmation(ctx, pending, text, telegramUserId);
      return;
    }

    if (isConfirmationYes(text)) {
      clearPendingConfirmation(telegramUserId);
      try {
        const reply = await executeResolvedIntent(
          pending.resolved,
          telegramUserId,
        );
        await ctx.reply(reply);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[bot] intent execution error: ${msg}`);
        await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
      }
      return;
    }

    if (isConfirmationNo(text)) {
      clearPendingConfirmation(telegramUserId);
      await ctx.reply("Отменено.");
      return;
    }

    await ctx.reply("Ожидаю подтверждение. Ответьте: да / нет");
    return;
  }

  const yandexState = getYandexGptState();
  if (!yandexState.enabled) {
    await ctx.reply("AI-парсер пока не настроен. Используйте команды /demo.");
    return;
  }

  const parsed = await parseTextIntent(text);
  if (!parsed.ok) {
    if (parsed.kind === "disabled") {
      await ctx.reply("AI-парсер пока не настроен. Используйте команды /demo.");
      return;
    }
    if (parsed.kind === "invalid_json" || parsed.kind === "invalid_schema") {
      await ctx.reply("Не смог разобрать команду. Попробуйте ещё раз.");
      return;
    }
    await ctx.reply("Не удалось обратиться к AI. Попробуйте позже или используйте /demo.");
    return;
  }

  const { intent } = parsed;
  if (intent.intent === "unknown" || intent.confidence < CONFIDENCE_THRESHOLD) {
    await ctx.reply("Не понял команду. Попробуйте переформулировать или используйте /demo.");
    return;
  }

  const resolvedResult = await resolveIntent(intent, telegramUserId);
  if (!resolvedResult.ok) {
    await ctx.reply(resolvedResult.message);
    return;
  }

  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent,
    resolved: resolvedResult.resolved,
  });
  await ctx.reply(buildIntentPreview(resolvedResult.resolved));
}
