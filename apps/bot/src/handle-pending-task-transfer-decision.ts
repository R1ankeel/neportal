import type { Context } from "grammy";
import { isConfirmationNo, isConfirmationYes } from "./confirmation";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import {
  clearPendingTaskTransferDecision,
  getPendingTaskTransferDecision,
  isPendingTaskTransferDecisionExpired,
} from "./pending-task-transfer-decision";
import { setPendingTaskTransferRejection } from "./pending-task-transfer-rejection";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import { executeAcceptTransfer } from "./task-transfer-flow";

export async function handlePendingTaskTransferDecisionMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingTaskTransferDecision(telegramUserId);
  if (!pending) return false;

  if (isPendingTaskTransferDecisionExpired(pending)) {
    clearPendingTaskTransferDecision(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isPendingDetailsCancel(text)) {
    clearPendingTaskTransferDecision(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingTaskTransferDecision(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  if (linked.id !== pending.toUserId) {
    clearPendingTaskTransferDecision(telegramUserId);
    await ctx.reply("Этот запрос на передачу задачи адресован другому сотруднику.");
    return true;
  }

  if (isConfirmationYes(text)) {
    clearPendingTaskTransferDecision(telegramUserId);
    try {
      const reply = await executeAcceptTransfer(ctx.api, linked, pending.transferId, {
        taskTitle: pending.taskTitle,
        requestedById: pending.requestedById,
        requestedByName: pending.requestedByName,
      });
      await ctx.reply(reply);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
    }
    return true;
  }

  if (isConfirmationNo(text)) {
    clearPendingTaskTransferDecision(telegramUserId);
    setPendingTaskTransferRejection(telegramUserId, {
      type: "awaiting_task_transfer_rejection_reason",
      transferId: pending.transferId,
      taskId: pending.taskId,
      taskTitle: pending.taskTitle,
      requestedById: pending.requestedById,
      toUserId: pending.toUserId,
      toUserName: linked.fullName,
      createdAt: Date.now(),
    });
    await ctx.reply(`Почему вы отказываетесь принять задачу «${pending.taskTitle}»?`);
    return true;
  }

  await ctx.reply("Ответьте: да / нет");
  return true;
}
