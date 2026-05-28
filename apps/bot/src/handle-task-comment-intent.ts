import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { fetchUsers } from "./api";
import {
  buildAddTaskCommentPayload,
  getAddTaskCommentComment,
  getAddTaskCommentTaskQuery,
} from "./add-task-comment-payload";
import { replyWithIntentPreview } from "./intent-preview";
import { setPendingConfirmation } from "./pending-intent";
import type { TaskSelectionPayload } from "./pending-task-selection";
import {
  buildResolvedAddTaskComment,
  buildResolvedAddTaskCommentWithMention,
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
import { validateAddTaskCommentPayload } from "./validate-add-task-comment-payload";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";
import { resolveUserFromAiPayload } from "./resolve-user-from-ai-payload";
import { gateMentionProjectMembership } from "./mention-project-membership";
import {
  apiUserToCandidate,
  startPendingUserSelection,
} from "./pending-user-selection";
import { formatUserCandidates } from "./user-selection-format";

const QUESTION_MISSING_TASK = "К какой задаче добавить комментарий?";

export type HandleAddTaskCommentIntentOptions = {
  userText?: string;
};

/** AI intent add_task_comment с выбором задачи и уточнением текста. */
export async function handleAddTaskCommentIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
  options?: HandleAddTaskCommentIntentOptions,
): Promise<void> {
  if (intent.intent !== "add_task_comment") return;

  const validated = validateAddTaskCommentPayload({
    payload: intent.payload,
    userText: options?.userText?.trim() ?? "",
  });
  const safeIntent: AiIntent = { ...intent, payload: validated.payload };

  const taskQuery = getAddTaskCommentTaskQuery(validated.payload);
  const comment = getAddTaskCommentComment(validated.payload);

  if (!taskQuery) {
    clearPendingTaskCommentDetails(telegramUserId);
    if (comment) {
      setPendingTaskCommentMissingTask(telegramUserId, comment);
    }
    await ctx.reply(QUESTION_MISSING_TASK);
    return;
  }

  // Resolve mention: prefer already-resolved mentionedUserId, fall back to mentionUserHints
  let mentionedUser: ApiUser | undefined;

  const mentionHints = validated.payload.mentionUserHints;
  const mentionId = validated.payload.mentionedUserId;

  if (mentionId || (mentionHints && mentionHints.length > 0)) {
    const users = await fetchUsers();
    const hint = mentionHints?.[0] ?? "";
    const match = resolveUserFromAiPayload({
      users,
      userId: mentionId,
      hint: hint || undefined,
      currentUser: linked,
    });
    if (match.kind === "none") {
      await ctx.reply(
        hint
          ? `Не нашёл сотрудника «${hint}». Уточните, кого нужно упомянуть.`
          : "Не удалось определить, кого упомянуть.",
      );
      return;
    }
    if (match.kind === "many") {
      startPendingUserSelection(
        telegramUserId,
        "select_user_for_comment_mention",
        match.users.map(apiUserToCandidate),
        { intent: "comment_mention", taskHint: taskQuery, commentText: comment ?? "" },
      );
      await replyWithActiveChoiceKeyboard(
        ctx,
        telegramUserId,
        formatUserCandidates(match.users.map(apiUserToCandidate)),
      );
      return;
    }
    mentionedUser = match.user;
  }

  const selectionPayload: TaskSelectionPayload = {};
  if (comment) {
    selectionPayload.commentText = comment;
  }
  if (mentionedUser) {
    selectionPayload.mentionedUserId = mentionedUser.id;
    selectionPayload.mentionedUserName = mentionedUser.fullName;
  }

  const resolution = await resolveTaskByTitle(
    linked,
    taskQuery,
    "comment",
    {
      telegramUserId,
      selectionPayload,
      projectHint: intent.payload.projectHint,
    },
  );

  if (resolution.kind !== "found") {
    await replyWithActiveChoiceKeyboard(ctx, telegramUserId, resolveResultToMessage(resolution));
    return;
  }

  const task = resolution.task;

  if (selectionPayload.commentText) {
    const resolved = mentionedUser
      ? buildResolvedAddTaskCommentWithMention(task, selectionPayload.commentText, mentionedUser)
      : buildResolvedAddTaskComment(task, selectionPayload.commentText);

    if (mentionedUser && resolved.mentionedUserId) {
      const canProceed = await gateMentionProjectMembership(
        ctx,
        telegramUserId,
        linked,
        task,
        mentionedUser,
        resolved,
        "add_task_comment",
        "preview",
      );
      if (!canProceed) return;
    }

    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: {
        ...safeIntent,
        payload: buildAddTaskCommentPayload({
          taskQuery,
          taskTitle: resolved.taskTitle,
          comment: resolved.text,
          mentionedUserId: resolved.mentionedUserId,
          mentionUserHints: mentionHints,
        }),
      },
      resolved,
    });
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
    return;
  }

  clearPendingTaskCommentDetails(telegramUserId);
  startPendingTaskCommentDetails(telegramUserId, task);
  await ctx.reply(questionForMissingComment());
}
