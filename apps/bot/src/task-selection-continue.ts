import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import { replyWithIntentPreview } from "./intent-preview";
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
  buildResolvedMentionInTask,
  startPendingTaskMentionDetails,
} from "./task-mention-flow";
import {
  buildResolvedTransferTask,
  startPendingTaskTransferComment,
} from "./task-transfer-flow";
import {
  assigneeMismatchMessage,
  buildResolvedReassignTask,
  MANAGER_REASSIGN_ONLY_MESSAGE,
} from "./task-reassign-flow";
import { isManagerOrOwner } from "./task-transfer-flow";
import { fetchUsers } from "./api";
import { getLinkedUserByTelegramId } from "./current-user";
import { buildResolvedStartTask } from "./task-start-flow";
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

  if (selectionType === "select_task_for_start") {
    const resolved = buildResolvedStartTask(task);
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: {
        intent: "start_task",
        confidence: 1,
        requiresConfirmation: true,
        payload: { taskTitle: resolved.taskTitle },
      },
      resolved,
    });
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
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
      await replyWithIntentPreview(ctx, telegramUserId, resolved);
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
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
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
            comment: resolved.text,
          },
        },
        resolved,
      });
      await replyWithIntentPreview(ctx, telegramUserId, resolved);
      return;
    }

    const question = startPendingTaskCommentDetails(telegramUserId, task);
    await ctx.reply(question);
    return;
  }

  if (selectionType === "select_task_for_mention" && payload.mentionedUserId) {
    const users = await fetchUsers();
    const mentionedUser = users.find((u) => u.id === payload.mentionedUserId);
    if (!mentionedUser) {
      await ctx.reply("Сотрудник не найден. Повторите команду.");
      return;
    }

    if (payload.mentionText?.trim()) {
      const resolved = buildResolvedMentionInTask(
        task,
        mentionedUser,
        payload.mentionText,
      );
      setPendingConfirmation(telegramUserId, {
        type: "ai_intent",
        intent: {
          intent: "mention_in_task",
          confidence: 1,
          requiresConfirmation: true,
          payload: {
            userHint: mentionedUser.fullName,
            taskTitle: resolved.taskTitle,
            text: resolved.text,
          },
        },
        resolved,
      });
      await replyWithIntentPreview(ctx, telegramUserId, resolved);
      return;
    }

    const question = startPendingTaskMentionDetails(telegramUserId, task, mentionedUser);
    await ctx.reply(question);
    return;
  }

  if (selectionType === "select_task_for_transfer" && payload.toUserId) {
    const users = await fetchUsers();
    const toUser = users.find((u) => u.id === payload.toUserId);
    if (!toUser) {
      await ctx.reply("Сотрудник не найден. Повторите команду.");
      return;
    }

    const linked = await getLinkedUserByTelegramId(telegramUserId);
    if (!linked) {
      await ctx.reply("Вы не привязаны ни к какому проекту.");
      return;
    }

    if (payload.transferComment?.trim()) {
      const resolved = buildResolvedTransferTask(
        task,
        toUser,
        payload.transferComment,
        linked.role,
      );
      setPendingConfirmation(telegramUserId, {
        type: "ai_intent",
        intent: {
          intent: "transfer_task",
          confidence: 1,
          requiresConfirmation: true,
          payload: {
            taskTitle: resolved.taskTitle,
            toUserHint: toUser.fullName,
            comment: resolved.comment,
          },
        },
        resolved,
      });
      await replyWithIntentPreview(ctx, telegramUserId, resolved);
      return;
    }

    const question = startPendingTaskTransferComment(telegramUserId, task, toUser);
    await ctx.reply(question);
    return;
  }

  if (selectionType === "select_task_for_reassign" && payload.toUserId) {
    const users = await fetchUsers();
    const toUser = users.find((u) => u.id === payload.toUserId);
    if (!toUser) {
      await ctx.reply("Сотрудник не найден. Повторите команду.");
      return;
    }

    const linked = await getLinkedUserByTelegramId(telegramUserId);
    if (!linked) {
      await ctx.reply("Вы не привязаны ни к какому проекту.");
      return;
    }

    if (!isManagerOrOwner(linked.role)) {
      await ctx.reply(MANAGER_REASSIGN_ONLY_MESSAGE);
      return;
    }

    if (
      payload.fromUserId &&
      task.assigneeId !== payload.fromUserId
    ) {
      const actualName = task.assignee?.fullName ?? "не назначен";
      const fromName = payload.fromUserName ?? "сотрудника";
      await ctx.reply(assigneeMismatchMessage(task.title, fromName, actualName));
      return;
    }

    if (task.assigneeId === toUser.id) {
      await ctx.reply("Сотрудник уже назначен на эту задачу.");
      return;
    }

    const resolved = buildResolvedReassignTask(
      task,
      toUser,
      payload.reassignComment,
      payload.fromUserId,
      payload.fromUserName,
    );
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: {
        intent: "reassign_task",
        confidence: 1,
        requiresConfirmation: true,
        payload: {
          taskTitle: resolved.taskTitle,
          fromUserHint: payload.fromUserName,
          toUserHint: toUser.fullName,
          comment: resolved.comment,
        },
      },
      resolved,
    });
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
  }
}
