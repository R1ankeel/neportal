import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { fetchUsers } from "./api";
import { replyWithIntentPreview } from "./intent-preview";
import { setPendingConfirmation } from "./pending-intent";
import type { TaskSelectionPayload } from "./pending-task-selection";
import {
  buildResolvedMentionInTask,
  startPendingTaskMentionDetails,
} from "./task-mention-flow";
import {
  buildUserSelectionPayload,
  resolveUserHintWithSelection,
} from "./user-hint-resolution";
import { canModifyTask } from "./task-status-flow";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";

/** AI intent mention_in_task с выбором задачи и уточнением текста. */
export async function handleMentionInTaskIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
): Promise<void> {
  if (intent.intent !== "mention_in_task") return;

  const users = await fetchUsers();
  const userSelectionPayload = buildUserSelectionPayload(intent, linked);
  if (!userSelectionPayload || userSelectionPayload.intent !== "mention_in_task") {
    await ctx.reply("Не удалось обработать команду.");
    return;
  }

  const userResolution = await resolveUserHintWithSelection(
    ctx,
    telegramUserId,
    users,
    intent.payload.userHint,
    linked,
    "select_user_for_mention",
    userSelectionPayload,
    intent.payload.mentionedUserId,
  );
  if (userResolution.status !== "resolved") return;

  const mentionedUser = userResolution.user;
  const taskSelectionPayload: TaskSelectionPayload = {
    mentionedUserId: mentionedUser.id,
    mentionedUserName: mentionedUser.fullName,
  };
  if (intent.payload.text?.trim()) {
    taskSelectionPayload.mentionText = intent.payload.text.trim();
  }

  const resolution = await resolveTaskByTitle(
    linked,
    intent.payload.taskTitle,
    "mention",
    {
      telegramUserId,
      selectionPayload: taskSelectionPayload,
      projectHint: intent.payload.projectHint,
    },
  );

  if (resolution.kind !== "found") {
    await replyWithActiveChoiceKeyboard(ctx, telegramUserId, resolveResultToMessage(resolution));
    return;
  }

  const task = resolution.task;
  if (!canModifyTask(linked, task)) {
    await ctx.reply("Вы не можете комментировать эту задачу.");
    return;
  }

  if (taskSelectionPayload.mentionText) {
    const resolved = buildResolvedMentionInTask(
      task,
      mentionedUser,
      taskSelectionPayload.mentionText,
    );
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent,
      resolved,
    });
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
    return;
  }

  const question = startPendingTaskMentionDetails(telegramUserId, task, mentionedUser);
  await ctx.reply(question);
}
