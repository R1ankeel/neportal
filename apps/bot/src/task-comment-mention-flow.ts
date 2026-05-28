import type { Context } from "grammy";
import type { ApiUser } from "./api";
import { fetchUsers } from "./api";
import { replyWithIntentPreview } from "./intent-preview";
import { setPendingConfirmation, clearPendingConfirmation } from "./pending-intent";
import { clearPendingTaskCommentDetails } from "./pending-task-comment-details";
import {
  apiUserToCandidate,
  startPendingUserSelection,
} from "./pending-user-selection";
import type { TaskSelectionPayload } from "./pending-task-selection";
import { buildAddTaskCommentPayload } from "./add-task-comment-payload";
import {
  buildResolvedAddTaskCommentWithMention,
} from "./task-comment-flow";
import { resolveMentionedUser } from "./task-mention-flow";
import { resolveTaskByTitle, resolveResultToMessage } from "./resolve-task-by-title";
import { formatUserCandidates } from "./user-selection-format";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";
import { gateMentionProjectMembership } from "./mention-project-membership";
import type { TaskCommentWithMentionResult } from "./parse-task-comment-with-mention-query";

/**
 * Full bot flow for a deterministically parsed "comment with mention" phrase.
 *
 * 1. Resolves the mentioned user (disambiguation if multiple matches).
 * 2. Resolves the task (disambiguation if multiple matches).
 * 3. Shows preview with "Упомянуть: <name>" line.
 * 4. On confirm, creates comment via createTaskCommentMention and notifies the mentioned user.
 */
export async function replyWithCommentWithMentionQuery(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  parsed: TaskCommentWithMentionResult,
): Promise<void> {
  const { taskHint, commentText, mentionUserHints } = parsed;

  const users = await fetchUsers();
  const userHint = mentionUserHints[0] ?? "";

  if (!userHint) {
    await ctx.reply("Не удалось определить, кого упомянуть.");
    return;
  }

  const userMatch = resolveMentionedUser(users, userHint, linked);

  if (userMatch.kind === "none") {
    await ctx.reply(
      userMatch.message ?? `Не нашёл сотрудника «${userHint}». Уточните, кого нужно упомянуть.`,
    );
    return;
  }

  if (userMatch.kind === "many") {
    startPendingUserSelection(
      telegramUserId,
      "select_user_for_comment_mention",
      userMatch.users.map(apiUserToCandidate),
      { intent: "comment_mention", taskHint, commentText },
    );
    await replyWithActiveChoiceKeyboard(
      ctx,
      telegramUserId,
      formatUserCandidates(userMatch.users.map(apiUserToCandidate)),
    );
    return;
  }

  const mentionedUser = userMatch.user;

  const selectionPayload: TaskSelectionPayload = {
    commentText,
    mentionedUserId: mentionedUser.id,
    mentionedUserName: mentionedUser.fullName,
  };

  const resolution = await resolveTaskByTitle(linked, taskHint, "comment", {
    telegramUserId,
    selectionPayload,
  });

  if (resolution.kind !== "found") {
    await replyWithActiveChoiceKeyboard(ctx, telegramUserId, resolveResultToMessage(resolution));
    return;
  }

  const task = resolution.task;
  const resolved = buildResolvedAddTaskCommentWithMention(task, commentText, mentionedUser);

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

  const intentForPending = {
    intent: "add_task_comment" as const,
    confidence: 1,
    requiresConfirmation: true,
    payload: buildAddTaskCommentPayload({
      taskTitle: task.title,
      comment: commentText,
      mentionedUserId: mentionedUser.id,
    }),
  };

  clearPendingTaskCommentDetails(telegramUserId);
  clearPendingConfirmation(telegramUserId);
  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent: intentForPending,
    resolved,
  });
  await replyWithIntentPreview(ctx, telegramUserId, resolved);
}
