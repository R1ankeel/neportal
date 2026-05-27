import { InlineKeyboard } from "grammy";

/** Префикс callback data для кнопок в уведомлениях о комментариях. */
export const TASK_NOTIFY_CALLBACK_PREFIX = "task";

export function buildTaskNotificationKeyboard(taskId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Показать задачу", `${TASK_NOTIFY_CALLBACK_PREFIX}:show:${taskId}`)
    .row()
    .text("Показать все комментарии", `${TASK_NOTIFY_CALLBACK_PREFIX}:comments:${taskId}`);
}

export function parseTaskNotifyCallbackData(
  data: string,
): { action: "show" | "comments"; taskId: string } | null {
  const match = /^task:(show|comments):(.+)$/.exec(data);
  if (!match?.[1] || !match[2]) return null;
  return { action: match[1] as "show" | "comments", taskId: match[2] };
}
