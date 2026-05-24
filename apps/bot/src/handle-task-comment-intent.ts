import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import {
  buildAddTaskCommentPayload,
  getAddTaskCommentComment,
  getAddTaskCommentTaskQuery,
} from "./add-task-comment-payload";
import { buildIntentPreview } from "./intent-preview";
import { setPendingConfirmation } from "./pending-intent";
import type { TaskSelectionPayload } from "./pending-task-selection";
import {
  buildResolvedAddTaskComment,
  questionForMissingComment,
  startPendingTaskCommentDetails,
} from "./task-comment-flow";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";
import {
  clearPendingTaskCommentDetails,
  setPendingTaskCommentMissingTask,
} from "./pending-task-comment-details";

const QUESTION_MISSING_TASK = "К какой задаче добавить комментарий?";

/** AI intent add_task_comment с выбором задачи и уточнением текста. */
export async function handleAddTaskCommentIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
): Promise<void> {
  if (intent.intent !== "add_task_comment") return;

  const taskQuery = getAddTaskCommentTaskQuery(intent.payload);
  const comment = getAddTaskCommentComment(intent.payload);

  if (!taskQuery) {
    clearPendingTaskCommentDetails(telegramUserId);
    if (comment) {
      setPendingTaskCommentMissingTask(telegramUserId, comment);
    }
    await ctx.reply(QUESTION_MISSING_TASK);
    return;
  }

  const selectionPayload: TaskSelectionPayload = {};
  if (comment) {
    selectionPayload.commentText = comment;
  }

  const resolution = await resolveTaskByTitle(
    linked,
    taskQuery,
    "comment",
    { telegramUserId, selectionPayload },
  );

  if (resolution.kind !== "found") {
    await ctx.reply(resolveResultToMessage(resolution));
    return;
  }

  const task = resolution.task;

  if (selectionPayload.commentText) {
    const resolved = buildResolvedAddTaskComment(task, selectionPayload.commentText);
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: {
        ...intent,
        payload: buildAddTaskCommentPayload({
          taskQuery,
          taskTitle: resolved.taskTitle,
          comment: resolved.text,
        }),
      },
      resolved,
    });
    await ctx.reply(buildIntentPreview(resolved));
    return;
  }

  clearPendingTaskCommentDetails(telegramUserId);
  startPendingTaskCommentDetails(telegramUserId, task);
  await ctx.reply(questionForMissingComment());
}
