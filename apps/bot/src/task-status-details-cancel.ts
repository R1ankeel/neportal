import { InlineKeyboard, type Context } from "grammy";
import { handlePendingTaskStatusDetailsMessage } from "./handle-pending-task-status-details";
import { safeAnswerCallbackQuery } from "./telegram/safe-answer-callback";

const CALLBACK_DATA = "task_status_details:cancel";

export function buildTaskStatusDetailsCancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Отменить", CALLBACK_DATA);
}

export function isTaskStatusDetailsCancelCallback(data: string | undefined): boolean {
  return data === CALLBACK_DATA;
}

export async function handleTaskStatusDetailsCancelCallback(ctx: Context): Promise<boolean> {
  if (!isTaskStatusDetailsCancelCallback(ctx.callbackQuery?.data)) return false;

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Не удалось определить пользователя.",
      show_alert: false,
    });
    return true;
  }

  await safeAnswerCallbackQuery(ctx);
  await handlePendingTaskStatusDetailsMessage(ctx, telegramUserId, "отмена");
  return true;
}
