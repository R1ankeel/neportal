import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { replyWithIntentPreview } from "./intent-preview";
import type { ResolvedCancelTask, ResolvedCompleteTask } from "./intent-resolver";
import {
  clearPendingConfirmation,
  setPendingConfirmation,
} from "./pending-intent";
import {
  clearPendingTaskStatusDetails,
  getPendingTaskStatusDetails,
  isPendingDetailsCancel,
  isPendingTaskStatusDetailsExpired,
} from "./pending-task-status-details";
function syntheticIntentForResolved(
  resolved: ResolvedCompleteTask | ResolvedCancelTask,
): AiIntent {
  if (resolved.intent === "complete_task") {
    return {
      intent: "complete_task",
      confidence: 1,
      requiresConfirmation: true,
      payload: {
        taskTitle: resolved.taskTitle,
        completionResult: resolved.completionResult ?? "",
      },
    };
  }
  return {
    intent: "cancel_task",
    confidence: 1,
    requiresConfirmation: true,
    payload: {
      taskTitle: resolved.taskTitle,
      cancellationReason: resolved.cancellationReason ?? "",
    },
  };
}

/**
 * Обработка текста результата/причины. Возвращает true, если сообщение обработано.
 */
export async function handlePendingTaskStatusDetailsMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingTaskStatusDetails(telegramUserId);
  if (!pending) return false;

  if (isPendingTaskStatusDetailsExpired(pending)) {
    clearPendingTaskStatusDetails(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingTaskStatusDetails(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingTaskStatusDetails(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  const resolved: ResolvedCompleteTask | ResolvedCancelTask =
    pending.type === "awaiting_completion_result"
      ? {
          intent: "complete_task",
          taskId: pending.taskId,
          taskTitle: pending.taskTitle,
          completionResult: text.trim(),
        }
      : {
          intent: "cancel_task",
          taskId: pending.taskId,
          taskTitle: pending.taskTitle,
          cancellationReason: text.trim(),
        };

  clearPendingTaskStatusDetails(telegramUserId);
  clearPendingConfirmation(telegramUserId);
  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent: syntheticIntentForResolved(resolved),
    resolved,
  });

  await replyWithIntentPreview(ctx, telegramUserId, resolved);
  return true;
}
