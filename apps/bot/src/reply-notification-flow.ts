import type { Context } from "grammy";
import {
  createTaskComment,
  createTaskCommentMention,
  fetchTaskById,
  fetchUsers,
  findNotificationBinding,
} from "./api";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import {
  notifyTaskCommentAdded,
  notifyTaskMentionRequested,
} from "./task-notifications";
import type { ResolvedAddTaskComment } from "./intent-resolver";

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
  let binding;
  try {
    binding = await findNotificationBinding(chatId, messageId);
  } catch {
    return false;
  }

  if (!binding) return false;

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
    task = await fetchTaskById(binding.taskId);
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

      const result = await createTaskCommentMention(binding.taskId, {
        authorId: linked.id,
        mentionedUserId: binding.sourceCommentAuthorId,
        text,
        source: "TELEGRAM_TEXT",
      });

      const commentId = result.comment.id;

      try {
        await notifyTaskMentionRequested(ctx.api, {
          taskId: binding.taskId,
          taskTitle: task.title,
          projectName: task.project?.name ?? null,
          text,
          author: linked,
          mentionedUser: {
            id: binding.sourceCommentAuthorId,
            fullName: mentionedUser?.fullName ?? result.mentionedUser.fullName,
            telegramId: mentionedUser?.telegramId ?? result.mentionedUser.telegramId ?? null,
          },
          commentId,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[reply-notification] mention notify error: ${msg}`);
      }
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
