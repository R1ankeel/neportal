import type { Context } from "grammy";
import {
  createTaskComment,
  fetchTaskById,
  fetchUsers,
  findNotificationBinding,
} from "./api";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { notifyTaskCommentAdded } from "./task-notifications";
import type { ResolvedAddTaskComment, ResolvedMentionInTask } from "./intent-resolver";
import {
  executeMentionResolved,
  gateMentionProjectMembership,
  mentionDisplayName,
} from "./mention-project-membership";
import { getPendingMentionAddToProject } from "./pending-mention-add-to-project";

/**
 * Intercepts replies to task notification messages and converts them
 * into task comments, bypassing the normal intent parsing pipeline.
 *
 * Returns true if the reply was handled (whether successfully or with an
 * error message), false if no binding was found and normal flow should continue.
 */
export async function handleReplyToNotification(
  ctx: Context,
  chatId: string,
  messageId: number,
  text: string,
): Promise<boolean> {
  console.log(`[reply-notification] reply detected chatId=${chatId} messageId=${messageId}`);

  let binding;
  try {
    binding = await findNotificationBinding(chatId, messageId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[reply-notification] binding lookup error: ${msg}`);
    return false;
  }

  if (!binding) {
    console.log(`[reply-notification] binding not found, continuing normal flow`);
    return false;
  }

  console.log(`[reply-notification] binding found taskId=${binding.taskId} type=${binding.notificationType}`);

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return true;

  let linked;
  try {
    linked = await getLinkedUserByTelegramId(telegramUserId);
  } catch {
    await ctx.reply("Не удалось добавить комментарий. Попробуйте ещё раз.");
    return true;
  }

  if (!linked) {
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  let task;
  try {
    task = await fetchTaskById(binding.taskId, linked.id);
  } catch {
    await ctx.reply("Не удалось добавить комментарий. Попробуйте ещё раз.");
    return true;
  }

  if (!task) {
    await ctx.reply("Задача не найдена или больше недоступна.");
    return true;
  }

  const isCommentOrMention =
    binding.notificationType === "TASK_COMMENT" ||
    binding.notificationType === "TASK_MENTION";

  try {
    if (
      isCommentOrMention &&
      binding.sourceCommentAuthorId &&
      binding.sourceCommentAuthorId !== linked.id
    ) {
      const users = await fetchUsers();
      const mentionedUser = users.find((u) => u.id === binding.sourceCommentAuthorId);
      if (!mentionedUser) {
        await ctx.reply("Сотрудник не найден. Повторите команду.");
        return true;
      }

      const resolved: ResolvedMentionInTask = {
        intent: "mention_in_task",
        taskId: binding.taskId,
        taskTitle: task.title,
        text,
        mentionedUserId: mentionedUser.id,
        mentionedUserName: mentionDisplayName(mentionedUser),
        mentionedUserTelegramId: mentionedUser.telegramId ?? null,
        creatorId: task.creatorId,
        assigneeId: task.assigneeId,
        projectName: task.project?.name,
      };

      const canProceed = await gateMentionProjectMembership(
        ctx,
        telegramUserId,
        linked,
        task,
        mentionedUser,
        resolved,
        "mention_in_task",
        "execute",
      );
      if (!canProceed) {
        if (!getPendingMentionAddToProject(telegramUserId)) {
          return true;
        }
        return true;
      }

      const reply = await executeMentionResolved(ctx.api, linked, resolved);
      await ctx.reply(reply);
      return true;
    } else {
      const result = await createTaskComment(binding.taskId, {
        authorId: linked.id,
        text,
        source: "TELEGRAM_TEXT",
      });

      const commentId = result.id;

      const resolved: ResolvedAddTaskComment = {
        intent: "add_task_comment",
        taskId: binding.taskId,
        taskTitle: task.title,
        text,
        creatorId: task.creatorId,
        assigneeId: task.assigneeId ?? null,
        projectName: task.project?.name,
      };

      try {
        await notifyTaskCommentAdded(ctx.api, resolved, linked, commentId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[reply-notification] comment notify error: ${msg}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[reply-notification] create comment error: ${msg}`);
    await ctx.reply("Не удалось добавить комментарий. Попробуйте ещё раз.");
    return true;
  }

  await ctx.reply(`Комментарий добавлен к задаче «${task.title}».`);
  return true;
}
