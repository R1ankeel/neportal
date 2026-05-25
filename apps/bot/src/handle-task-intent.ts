import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { replyWithIntentPreview } from "./intent-preview";
import type { ResolvedSetTaskDeadline } from "./intent-resolver";
import { setPendingConfirmation } from "./pending-intent";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
  type TaskResolvePurpose,
} from "./resolve-task-by-title";
import type { TaskSelectionPayload } from "./pending-task-selection";
import { buildResolvedStartTask } from "./task-start-flow";
import {
  buildResolvedCancelTask,
  buildResolvedCompleteTask,
  startPendingTaskStatusDetails,
} from "./task-status-flow";

/** AI intents complete_task / cancel_task / start_task / set_task_deadline с выбором задачи. */
export async function handleTaskActionIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
): Promise<void> {
  if (
    intent.intent !== "complete_task" &&
    intent.intent !== "cancel_task" &&
    intent.intent !== "start_task" &&
    intent.intent !== "set_task_deadline"
  ) {
    return;
  }

  const purpose: TaskResolvePurpose =
    intent.intent === "complete_task"
      ? "complete"
      : intent.intent === "cancel_task"
        ? "cancel"
        : intent.intent === "start_task"
          ? "start"
          : "deadline";

  const selectionPayload: TaskSelectionPayload = {};
  if (intent.intent === "complete_task" && intent.payload.completionResult?.trim()) {
    selectionPayload.completionResult = intent.payload.completionResult.trim();
  }
  if (intent.intent === "cancel_task" && intent.payload.cancellationReason?.trim()) {
    selectionPayload.cancellationReason = intent.payload.cancellationReason.trim();
  }
  if (intent.intent === "set_task_deadline") {
    selectionPayload.deadlineDate = intent.payload.deadlineDate;
  }

  const resolution = await resolveTaskByTitle(linked, intent.payload.taskTitle, purpose, {
    telegramUserId,
    selectionPayload,
  });

  if (resolution.kind !== "found") {
    await ctx.reply(resolveResultToMessage(resolution));
    return;
  }

  const task = resolution.task;

  if (intent.intent === "start_task") {
    const resolved = buildResolvedStartTask(task);
    setPendingConfirmation(telegramUserId, { type: "ai_intent", intent, resolved });
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
    return;
  }

  if (intent.intent === "set_task_deadline") {
    const resolved: ResolvedSetTaskDeadline = {
      intent: "set_task_deadline",
      taskId: task.id,
      taskTitle: task.title,
      deadlineDate: intent.payload.deadlineDate,
      projectName: task.project?.name,
    };
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent,
      resolved,
    });
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
    return;
  }

  if (intent.intent === "complete_task") {
    if (selectionPayload.completionResult) {
      const resolved = buildResolvedCompleteTask(task, selectionPayload.completionResult);
      setPendingConfirmation(telegramUserId, { type: "ai_intent", intent, resolved });
      await replyWithIntentPreview(ctx, telegramUserId, resolved);
      return;
    }
    const question = startPendingTaskStatusDetails(
      telegramUserId,
      task,
      "awaiting_completion_result",
    );
    await ctx.reply(question);
    return;
  }

  if (intent.intent === "cancel_task") {
    if (selectionPayload.cancellationReason) {
      const resolved = buildResolvedCancelTask(task, selectionPayload.cancellationReason);
      setPendingConfirmation(telegramUserId, { type: "ai_intent", intent, resolved });
      await replyWithIntentPreview(ctx, telegramUserId, resolved);
      return;
    }
    const question = startPendingTaskStatusDetails(
      telegramUserId,
      task,
      "awaiting_cancellation_reason",
    );
    await ctx.reply(question);
  }
}
