import type { Context } from "grammy";
import {
  fetchTaskComments,
  fetchTasks,
  type ApiTask,
  type ApiTaskComment,
  type ApiUser,
} from "./api";
import { formatIsoDateRu } from "./parse-ru-date";
import {
  resolveResultToMessage,
  resolveTaskByTitle,
} from "./resolve-task-by-title";
import { canReadTask } from "./task-read-access";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";

export function formatCommentCreatedAt(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return createdAt;

  const iso = createdAt.slice(0, 10);
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatIsoDateRu(iso) : createdAt;
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${datePart} ${hours}:${minutes}`;
}

function formatCommentMentions(comment: ApiTaskComment): string | null {
  const names = comment.mentions
    ?.map((m) => m.mentionedUser.fullName.trim())
    .filter((name) => name.length > 0);
  if (!names?.length) return null;
  const unique = Array.from(new Set(names));
  return `Упоминания: ${unique.join(", ")}`;
}

export function formatTaskCommentsList(
  taskTitle: string,
  comments: ApiTaskComment[],
): string {
  if (comments.length === 0) {
    return "В этой задаче пока нет комментариев.";
  }

  const lines = [`Комментарии по задаче "${taskTitle}":`, ""];
  comments.forEach((comment, index) => {
    const when = formatCommentCreatedAt(comment.createdAt);
    const author = comment.author.fullName;
    lines.push(`${index + 1}. ${when} - ${author}`, comment.text.trim());
    const mentionsLine = formatCommentMentions(comment);
    if (mentionsLine) {
      lines.push(mentionsLine);
    }
    if (index < comments.length - 1) {
      lines.push("");
    }
  });
  return lines.join("\n");
}

export async function formatTaskCommentsReply(
  task: Pick<ApiTask, "id" | "title">,
): Promise<string> {
  const comments = await fetchTaskComments(task.id);
  return formatTaskCommentsList(task.title, comments);
}

export async function replyWithTaskComments(
  ctx: Context,
  task: Pick<ApiTask, "id" | "title">,
): Promise<void> {
  const reply = await formatTaskCommentsReply(task);
  await ctx.reply(reply);
}

async function findTaskById(taskId: string, actorUserId: string): Promise<ApiTask | null> {
  const tasks = await fetchTasks(actorUserId);
  return tasks.find((t) => t.id === taskId) ?? null;
}

/** Показать комментарии по подсказке названия или id задачи. */
export async function replyWithTaskCommentsForHint(
  ctx: Context,
  currentUser: ApiUser,
  telegramUserId: number,
  hint: string,
  taskId?: string,
  projectHint?: string,
): Promise<void> {
  const trimmedHint = hint.trim();

  if (taskId) {
    const task = await findTaskById(taskId, currentUser.id);
    if (!task) {
      await ctx.reply("Задача не найдена.");
      return;
    }
    if (!canReadTask(currentUser, task)) {
      await ctx.reply("Вы не можете просматривать комментарии этой задачи.");
      return;
    }
    await replyWithTaskComments(ctx, task);
    return;
  }

  if (!trimmedHint) {
    await ctx.reply("Укажите название задачи, например: «Покажи комментарии по задаче склад».");
    return;
  }

  const resolution = await resolveTaskByTitle(
    currentUser,
    trimmedHint,
    "comments_list",
    { telegramUserId, projectHint },
  );

  if (resolution.kind !== "found") {
    await replyWithActiveChoiceKeyboard(ctx, telegramUserId, resolveResultToMessage(resolution));
    return;
  }

  const task = resolution.task;
  if (!canReadTask(currentUser, task)) {
    await ctx.reply("Вы не можете просматривать комментарии этой задачи.");
    return;
  }

  await replyWithTaskComments(ctx, task);
}
