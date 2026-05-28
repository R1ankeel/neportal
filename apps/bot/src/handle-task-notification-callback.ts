import type { Context } from "grammy";
import { fetchTaskById, fetchUserByTelegramId } from "./api";
import { formatTaskCard } from "./task-card-format";
import { formatTaskCommentsReply } from "./task-comments-list-flow";
import { canReadTask } from "./task-read-access";
import {
  parseTaskNotifyCallbackData,
  TASK_NOTIFY_CALLBACK_PREFIX,
} from "./telegram/keyboards/task-notification-keyboard";
import { safeAnswerCallbackQuery } from "./telegram/safe-answer-callback";

const TASK_NOT_FOUND_MESSAGE = "Задача не найдена или больше недоступна.";

export async function handleTaskNotificationCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith(`${TASK_NOTIFY_CALLBACK_PREFIX}:`)) return false;

  const parsed = parseTaskNotifyCallbackData(data);
  const telegramUserId = ctx.from?.id;
  if (!parsed || !telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: "Неизвестная команда.", show_alert: false });
    return true;
  }

  const linked = await fetchUserByTelegramId(String(telegramUserId));
  if (!linked) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Вы не привязаны к Neportal. Отправьте /start.",
      show_alert: true,
    });
    return true;
  }

  let task;
  try {
    task = await fetchTaskById(parsed.taskId, linked.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] fetchTaskById error: ${msg}`);
    await safeAnswerCallbackQuery(ctx, { text: "Ошибка при загрузке задачи.", show_alert: true });
    return true;
  }

  if (!task || !canReadTask(linked, task)) {
    await safeAnswerCallbackQuery(ctx);
    await ctx.reply(TASK_NOT_FOUND_MESSAGE);
    return true;
  }

  await safeAnswerCallbackQuery(ctx);

  if (parsed.action === "show") {
    await ctx.reply(formatTaskCard(task));
    return true;
  }

  const reply = await formatTaskCommentsReply(task);
  await ctx.reply(reply);
  return true;
}
