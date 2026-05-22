import type { Context } from "grammy";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import {
  clearPendingTaskTransferRejection,
  getPendingTaskTransferRejection,
  isPendingTaskTransferRejectionExpired,
} from "./pending-task-transfer-rejection";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import { executeRejectTransfer } from "./task-transfer-flow";

export async function handlePendingTaskTransferRejectionMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingTaskTransferRejection(telegramUserId);
  if (!pending) return false;

  if (isPendingTaskTransferRejectionExpired(pending)) {
    clearPendingTaskTransferRejection(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingTaskTransferRejection(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  const reason = text.trim();
  if (!reason) {
    await ctx.reply(`Почему вы отказываетесь принять задачу «${pending.taskTitle}»?`);
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingTaskTransferRejection(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  if (linked.id !== pending.toUserId) {
    clearPendingTaskTransferRejection(telegramUserId);
    await ctx.reply("Этот запрос на передачу задачи адресован другому сотруднику.");
    return true;
  }

  clearPendingTaskTransferRejection(telegramUserId);
  try {
    const reply = await executeRejectTransfer(
      ctx.api,
      linked,
      pending.transferId,
      reason,
      { taskTitle: pending.taskTitle, requestedById: pending.requestedById },
    );
    await ctx.reply(reply);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }

  return true;
}
