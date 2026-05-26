import type { Context } from "grammy";
import { devLog } from "../dev-log";
import { downloadTelegramFileBuffer, safeTelegramFileDownloadError } from "../telegram/download-telegram-file";
import { getSpeechKitState } from "./speechkit-config";
import { recognizeOggOpus } from "./speechkit-client";
import { SpeechKitError } from "./types";
import { hasBlockingPendingState } from "./voice-pending-guard";

function previewText(text: string, max = 80): string {
  return text.slice(0, max);
}

export async function handleTelegramVoiceMessage(ctx: Context): Promise<boolean> {
  const voice = ctx.message?.voice;
  if (!voice) return false;

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await ctx.reply("Не удалось определить пользователя. Напишите команду текстом.");
    return true;
  }

  if (hasBlockingPendingState(telegramUserId)) {
    await ctx.reply(
      "Сейчас нужно завершить текущее действие. Используйте кнопки ниже или напишите ответ текстом.",
    );
    return true;
  }

  const speechState = getSpeechKitState();
  if (!speechState.enabled) {
    await ctx.reply("Голосовые сообщения пока отключены. Напишите команду текстом.");
    return true;
  }
  if (!speechState.configured) {
    console.warn("[voice] speechkit not configured", {
      provider: speechState.provider,
      enabled: speechState.enabled,
      configured: speechState.configured,
      reason: speechState.reason,
      missingEnv: speechState.missingEnv,
    });
    await ctx.reply("Голосовые сообщения временно недоступны. Напишите команду текстом.");
    return true;
  }

  if (voice.duration > speechState.maxDurationSec) {
    await ctx.reply(
      `Голосовое слишком длинное. Пока я обрабатываю сообщения до ${speechState.maxDurationSec} сек. Отправьте короче или напишите текстом.`,
    );
    return true;
  }

  try {
    const file = await ctx.api.getFile(voice.file_id);
    if (!file.file_path) {
      await ctx.reply("Не удалось получить голосовое сообщение. Попробуйте ещё раз или напишите текстом.");
      return true;
    }

    const audioBuffer = await downloadTelegramFileBuffer({ filePath: file.file_path });
    const fileSizeBytes = audioBuffer.byteLength;

    const maxFileSizeBytes = speechState.maxFileSizeMb * 1024 * 1024;
    if (fileSizeBytes > maxFileSizeBytes) {
      await ctx.reply(
        `Голосовое слишком большое. Пока я обрабатываю файлы до ${speechState.maxFileSizeMb} МБ. Отправьте короче или напишите текстом.`,
      );
      return true;
    }

    const recognized = await recognizeOggOpus({ audioBuffer });
    const text = recognized.text.trim();
    if (!text) {
      await ctx.reply("Не удалось распознать голосовое сообщение. Попробуйте ещё раз или напишите текстом.");
      return true;
    }

    console.info("[voice] speechkit recognize success", {
      provider: recognized.provider,
      durationSec: voice.duration,
      fileSizeBytes,
      durationMs: recognized.durationMs,
      recognizedTextChars: text.length,
    });
    if (process.env.BOT_DEV_LOG !== "0") {
      devLog("voice recognized preview", {
        provider: recognized.provider,
        recognizedTextPreview: previewText(text),
      });
    }

    await ctx.reply(
      `🎙 Распознал:\n"${text}"\n\nПока голосовые команды работают в тестовом режиме. На следующем этапе я смогу выполнять эту команду как обычный текст.`,
    );
    return true;
  } catch (err) {
    if (err instanceof SpeechKitError) {
      console.warn("[voice] speechkit recognize failed", {
        provider: err.provider,
        code: err.code,
        status: err.status,
        requestId: err.requestId,
        retryable: err.retryable,
        timeoutMs: err.timeoutMs,
      });
      switch (err.code) {
        case "SPEECHKIT_NOT_ENABLED":
          await ctx.reply("Голосовые сообщения пока отключены. Напишите команду текстом.");
          return true;
        case "SPEECHKIT_NOT_CONFIGURED":
          await ctx.reply("Голосовые сообщения временно недоступны. Напишите команду текстом.");
          return true;
        case "SPEECHKIT_FILE_TOO_LARGE":
          await ctx.reply(
            `Голосовое слишком большое. Пока я обрабатываю файлы до ${speechState.maxFileSizeMb} МБ. Отправьте короче или напишите текстом.`,
          );
          return true;
        case "SPEECHKIT_TIMEOUT":
          await ctx.reply("Распознавание заняло слишком много времени. Попробуйте ещё раз или напишите текстом.");
          return true;
        case "SPEECHKIT_EMPTY_RESULT":
          await ctx.reply("Не удалось распознать голосовое сообщение. Попробуйте ещё раз или напишите текстом.");
          return true;
        case "SPEECHKIT_HTTP_ERROR":
        case "SPEECHKIT_NETWORK_ERROR":
          await ctx.reply("Не удалось распознать голосовое из-за временной ошибки. Попробуйте позже или напишите текстом.");
          return true;
        default:
          await ctx.reply("Не удалось распознать голосовое сообщение. Попробуйте ещё раз или напишите текстом.");
          return true;
      }
    }

    console.error("[voice] telegram voice intake failed", {
      error: safeTelegramFileDownloadError(err),
    });
    await ctx.reply("Не удалось обработать голосовое сообщение. Попробуйте ещё раз или напишите текстом.");
    return true;
  }
}

