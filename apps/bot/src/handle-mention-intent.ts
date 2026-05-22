import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { fetchUsers } from "./api";
import { buildIntentPreview } from "./intent-preview";
import { setPendingConfirmation } from "./pending-intent";
import type { TaskSelectionPayload } from "./pending-task-selection";
import {
  buildResolvedMentionInTask,
  resolveMentionedUser,
  startPendingTaskMentionDetails,
} from "./task-mention-flow";
import { canModifyTask } from "./task-status-flow";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";

/** AI intent mention_in_task с выбором задачи и уточнением текста. */
export async function handleMentionInTaskIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
): Promise<void> {
  if (intent.intent !== "mention_in_task") return;

  const users = await fetchUsers();
  const userMatch = resolveMentionedUser(users, intent.payload.userHint);
  if (userMatch.kind === "none" || userMatch.kind === "many") {
    await ctx.reply(userMatch.message ?? "Не удалось найти сотрудника.");
    return;
  }

  const mentionedUser = userMatch.user;
  const selectionPayload: TaskSelectionPayload = {
    mentionedUserId: mentionedUser.id,
    mentionedUserName: mentionedUser.fullName,
  };
  if (intent.payload.text?.trim()) {
    selectionPayload.mentionText = intent.payload.text.trim();
  }

  const resolution = await resolveTaskByTitle(
    linked,
    intent.payload.taskTitle,
    "mention",
    { telegramUserId, selectionPayload },
  );

  if (resolution.kind !== "found") {
    await ctx.reply(resolveResultToMessage(resolution));
    return;
  }

  const task = resolution.task;
  if (!canModifyTask(linked, task)) {
    await ctx.reply("Вы не можете комментировать эту задачу.");
    return;
  }

  if (selectionPayload.mentionText) {
    const resolved = buildResolvedMentionInTask(
      task,
      mentionedUser,
      selectionPayload.mentionText,
    );
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent,
      resolved,
    });
    await ctx.reply(buildIntentPreview(resolved));
    return;
  }

  const question = startPendingTaskMentionDetails(telegramUserId, task, mentionedUser);
  await ctx.reply(question);
}
