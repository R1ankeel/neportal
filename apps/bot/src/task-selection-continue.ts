import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import { buildIntentPreview } from "./intent-preview";
import type { ResolvedSetTaskDeadline } from "./intent-resolver";
import { setPendingConfirmation } from "./pending-intent";
import {
  candidateToApiTask,
  type PendingTaskSelectionType,
  type TaskCandidate,
  type TaskSelectionPayload,
} from "./pending-task-selection";
import {
  buildResolvedAddTaskComment,
  startPendingTaskCommentDetails,
} from "./task-comment-flow";
import {
  buildResolvedCancelTask,
  buildResolvedCompleteTask,
  startPendingTaskStatusDetails,
} from "./task-status-flow";

function syntheticDeadlineIntent(resolved: ResolvedSetTaskDeadline): AiIntent {
  return {
    intent: "set_task_deadline",
    confidence: 1,
    requiresConfirmation: true,
    payload: {
      taskTitle: resolved.taskTitle,
      deadlineDate: resolved.deadlineDate,
    },
  };
}

/** После выбора номера — confirmation или уточняющий вопрос. */
export async function continueAfterTaskSelection(
  ctx: Context,
  telegramUserId: number,
  selected: TaskCandidate,
  selectionType: PendingTaskSelectionType,
  payload: TaskSelectionPayload,
): Promise<void> {
  const task = candidateToApiTask(selected);

  if (selectionType === "select_task_for_complete") {
    if (payload.completionResult?.trim()) {
      const resolved = buildResolvedCompleteTask(task, payload.completionResult);
      setPendingConfirmation(telegramUserId, {
        type: "ai_intent",
        intent: {
          intent: "complete_task",
          confidence: 1,
          requiresConfirmation: true,
          payload: {
            taskTitle: resolved.taskTitle,
            completionResult: resolved.completionResult ?? "",
          },
        },
        resolved,
      });
      await ctx.reply(buildIntentPreview(resolved));
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

  if (selectionType === "select_task_for_cancel") {
    if (payload.cancellationReason?.trim()) {
      const resolved = buildResolvedCancelTask(task, payload.cancellationReason);
      setPendingConfirmation(telegramUserId, {
        type: "ai_intent",
        intent: {
          intent: "cancel_task",
          confidence: 1,
          requiresConfirmation: true,
          payload: {
            taskTitle: resolved.taskTitle,
            cancellationReason: resolved.cancellationReason ?? "",
          },
        },
        resolved,
      });
      await ctx.reply(buildIntentPreview(resolved));
      return;
    }

    const question = startPendingTaskStatusDetails(
      telegramUserId,
      task,
      "awaiting_cancellation_reason",
    );
    await ctx.reply(question);
    return;
  }

  if (selectionType === "select_task_for_deadline" && payload.deadlineDate) {
    const resolved: ResolvedSetTaskDeadline = {
      intent: "set_task_deadline",
      taskId: task.id,
      taskTitle: task.title,
      deadlineDate: payload.deadlineDate,
      projectName: task.project?.name,
    };
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: syntheticDeadlineIntent(resolved),
      resolved,
    });
    await ctx.reply(buildIntentPreview(resolved));
    return;
  }

  if (selectionType === "select_task_for_comment") {
    if (payload.commentText?.trim()) {
      const resolved = buildResolvedAddTaskComment(task, payload.commentText);
      setPendingConfirmation(telegramUserId, {
        type: "ai_intent",
        intent: {
          intent: "add_task_comment",
          confidence: 1,
          requiresConfirmation: true,
          payload: {
            taskTitle: resolved.taskTitle,
            text: resolved.text,
          },
        },
        resolved,
      });
      await ctx.reply(buildIntentPreview(resolved));
      return;
    }

    const question = startPendingTaskCommentDetails(telegramUserId, task);
    await ctx.reply(question);
  }
}
