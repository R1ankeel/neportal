import type { Context } from "grammy";
import { devLog } from "../dev-log";
import { downloadTelegramFileBuffer, safeTelegramFileDownloadError } from "../telegram/download-telegram-file";
import { handleTextSemanticMessage } from "../ai-message";
import { getPendingConfirmationEdit } from "../pending-confirmation-edit";
import { getPendingTaskStatusDetails } from "../pending-task-status-details";
import { cleanupRecognizedVoiceText } from "./voice-text-cleanup";
import { getSpeechKitState } from "./speechkit-config";
import { recognizeOggOpus } from "./speechkit-client";
import { recognizeOggOpusAsyncFromObject } from "./speechkit-async-client";
import { SpeechKitError } from "./types";
import { hasBlockingPendingState } from "./voice-pending-guard";
import { deleteObjectBestEffort, uploadTempObject } from "../storage/yandex-object-storage";
import { handleReplyToNotification } from "../reply-notification-flow";

function previewText(text: string, max = 80): string {
  return text.slice(0, max);
}

export function resolveVoiceRecognitionMode(params: {
  durationSec: number;
  syncMaxDurationSec: number;
  asyncEnabled: boolean;
  asyncConfigured: boolean;
  asyncMaxDurationSec: number;
}): "sync" | "async" | "reject_async_disabled" | "reject_async_too_long" {
  if (params.durationSec <= params.syncMaxDurationSec) return "sync";
  if (!params.asyncEnabled || !params.asyncConfigured) return "reject_async_disabled";
  if (params.durationSec > params.asyncMaxDurationSec) return "reject_async_too_long";
  return "async";
}

export async function handleTelegramVoiceMessage(ctx: Context): Promise<boolean> {
  const voice = ctx.message?.voice;
  if (!voice) return false;

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await ctx.reply("Не удалось определить пользователя. Напишите команду текстом.");
    return true;
  }

  if (hasBlockingPendingState(telegramUserId, { allowCreateTaskAssigneeInput: true })) {
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

  const recognitionMode = resolveVoiceRecognitionMode({
    durationSec: voice.duration,
    syncMaxDurationSec: speechState.maxDurationSec,
    asyncEnabled: speechState.asyncEnabled,
    asyncConfigured: speechState.asyncConfigured,
    asyncMaxDurationSec: speechState.asyncMaxDurationSec,
  });
  const useAsyncForLongVoice = recognitionMode === "async";
  if (recognitionMode === "reject_async_disabled") {
    await ctx.reply(
      `Голосовое слишком длинное. Пока я обрабатываю короткие сообщения до ${speechState.maxDurationSec} сек.`,
    );
    return true;
  }
  if (recognitionMode === "reject_async_too_long") {
    const maxMinutes = Math.floor(speechState.asyncMaxDurationSec / 60);
    await ctx.reply(`Голосовое слишком длинное. Максимум ${maxMinutes} минут.`);
    return true;
  }

  if (useAsyncForLongVoice) {
    if (!speechState.asyncEnabled || !speechState.asyncConfigured) {
      await ctx.reply(
        `Голосовое слишком длинное. Пока я обрабатываю короткие сообщения до ${speechState.maxDurationSec} сек.`,
      );
      return true;
    }
  }

  try {
    const file = await ctx.api.getFile(voice.file_id);
    if (!file.file_path) {
      await ctx.reply("Не удалось получить голосовое сообщение. Попробуйте ещё раз или напишите текстом.");
      return true;
    }

    const audioBuffer = await downloadTelegramFileBuffer({ filePath: file.file_path });
    const fileSizeBytes = audioBuffer.byteLength;

    const maxFileSizeMb = useAsyncForLongVoice
      ? speechState.asyncMaxFileSizeMb
      : speechState.maxFileSizeMb;
    const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;
    if (fileSizeBytes > maxFileSizeBytes) {
      await ctx.reply(
        `Файл слишком большой. Пока я обрабатываю файлы до ${maxFileSizeMb} МБ.`,
      );
      return true;
    }

    let recognized;
    if (useAsyncForLongVoice) {
      await ctx.reply("Голосовое длинное, распознаю. Это может занять немного времени...");
      let uploaded: { bucket: string; key: string; objectUri: string } | null = null;
      try {
        uploaded = await uploadTempObject({
          buffer: audioBuffer,
          contentType: "audio/ogg",
          extension: "ogg",
          source: "telegram-voice",
        });
        recognized = await recognizeOggOpusAsyncFromObject({
          objectUri: uploaded.objectUri,
        });
      } finally {
        if (uploaded && speechState.asyncDeleteObject) {
          await deleteObjectBestEffort(uploaded.bucket, uploaded.key);
        }
      }
    } else {
      recognized = await recognizeOggOpus({ audioBuffer });
    }
    const text = recognized.text.trim();
    if (!text) {
      await ctx.reply("Не удалось распознать голосовое сообщение. Попробуйте ещё раз или напишите текстом.");
      return true;
    }

    const editPending = getPendingConfirmationEdit(telegramUserId);
    const taskStatusPending = getPendingTaskStatusDetails(telegramUserId);
    const cleanupMode =
      editPending?.step === "await_value"
        ? { mode: "value" as const, valueFieldKey: editPending.field }
        : taskStatusPending?.type === "awaiting_completion_result"
          ? { mode: "value" as const, valueFieldKey: "completionResult" }
          : taskStatusPending?.type === "awaiting_cancellation_reason"
            ? { mode: "value" as const, valueFieldKey: "cancellationReason" }
            : { mode: "semantic" as const };
    const cleanupResult = await cleanupRecognizedVoiceText(text, cleanupMode);
    const finalText = cleanupResult.text;

    console.info("[voice] speechkit recognize success", {
      provider: recognized.provider,
      durationSec: voice.duration,
      fileSizeBytes,
      durationMs: recognized.durationMs,
      recognizedTextChars: text.length,
      cleanedTextChars: finalText.length,
      cleanupSource: cleanupResult.source,
      changed: cleanupResult.changed,
    });

    if (process.env.BOT_DEV_LOG !== "0") {
      devLog("voice recognized preview", {
        provider: recognized.provider,
        recognizedTextPreview: previewText(text),
        cleanedTextPreview: previewText(finalText),
        cleanupSource: cleanupResult.source,
        changed: cleanupResult.changed,
      });
    }

    const textToShow = cleanupResult.changed ? finalText : text;
    await ctx.reply(`🎙 Распознал:\n"${textToShow}"`);

    const replyTo = ctx.message?.reply_to_message;
    if (replyTo?.message_id && ctx.chat?.id) {
      const chatId = String(ctx.chat.id);
      const handled = await handleReplyToNotification(ctx, chatId, replyTo.message_id, finalText);
      if (handled) return true;
    }

    try {
      await handleTextSemanticMessage(ctx, finalText, {
        source: "voice",
        recognizedFromVoice: true,
      });
    } catch (pipelineError) {
      console.error("[voice] semantic pipeline failed", {
        error: safeTelegramFileDownloadError(pipelineError),
      });
      await ctx.reply("Распознать получилось, но обработать команду не удалось. Попробуйте отправить её текстом.");
    }

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
        case "SPEECHKIT_ASYNC_START_ERROR":
        case "SPEECHKIT_ASYNC_POLL_ERROR":
          await ctx.reply("Не удалось распознать длинное голосовое из-за временной ошибки. Попробуйте позже или отправьте текстом.");
          return true;
        case "SPEECHKIT_ASYNC_TIMEOUT":
          await ctx.reply("Распознавание длинного голосового заняло слишком много времени. Попробуйте ещё раз позже.");
          return true;
        case "SPEECHKIT_STORAGE_NOT_CONFIGURED":
          await ctx.reply("Длинные голосовые пока не поддерживаются в этой конфигурации.");
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
