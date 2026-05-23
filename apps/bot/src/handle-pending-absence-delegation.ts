import type { Context } from "grammy";
import { formatItemAssigneeQuestion } from "./absence-delegation-format";
import {
  advanceAfterAssignment,
  assignmentKeep,
  assignmentTransfer,
  isDelegationDistributeMode,
  isDelegationKeepAllMode,
  isDelegationKeepItemAnswer,
  startItemDistribution,
} from "./absence-delegation-state";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import {
  clearPendingAbsenceDelegation,
  getPendingAbsenceDelegation,
  isPendingAbsenceDelegationExpired,
} from "./pending-absence-delegation";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import { fetchUsers } from "./api";
import { resolveUserHintWithSelection } from "./user-hint-resolution";

const MODE_HINT = "Ответьте: оставить / распределить";

export async function handlePendingAbsenceDelegationMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingAbsenceDelegation(telegramUserId);
  if (!pending) return false;

  if (isPendingAbsenceDelegationExpired(pending)) {
    clearPendingAbsenceDelegation(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (pending.type === "awaiting_absence_delegation_mode") {
    if (isPendingDetailsCancel(text) || isDelegationKeepAllMode(text)) {
      clearPendingAbsenceDelegation(telegramUserId);
      await ctx.reply("Ок, задачи остаются за вами.");
      return true;
    }

    if (isDelegationDistributeMode(text)) {
      const linked = await getLinkedUserByTelegramId(telegramUserId);
      if (!linked) {
        clearPendingAbsenceDelegation(telegramUserId);
        await ctx.reply(NOT_LINKED_MESSAGE);
        return true;
      }
      if (linked.id !== pending.absenceUserId) {
        await ctx.reply("Распределение задач может оформить только отсутствующий сотрудник.");
        return true;
      }

      const ctxBase = {
        absenceId: pending.absenceId,
        absenceUserId: pending.absenceUserId,
        absenceUserName: pending.absenceUserName,
        absenceType: pending.absenceType,
        startDate: pending.startDate,
        endDate: pending.endDate,
        tasks: pending.tasks,
      };
      startItemDistribution(telegramUserId, ctxBase);
      const first = pending.tasks[0];
      await ctx.reply(formatItemAssigneeQuestion(first, 0, pending.tasks.length));
      return true;
    }

    await ctx.reply(MODE_HINT);
    return true;
  }

  if (pending.type === "awaiting_absence_delegation_item_assignee") {
    if (isPendingDetailsCancel(text)) {
      clearPendingAbsenceDelegation(telegramUserId);
      await ctx.reply("Ок, распределение отменено. Задачи остаются за вами.");
      return true;
    }

    const linked = await getLinkedUserByTelegramId(telegramUserId);
    if (!linked) {
      clearPendingAbsenceDelegation(telegramUserId);
      await ctx.reply(NOT_LINKED_MESSAGE);
      return true;
    }

    if (linked.id !== pending.absenceUserId) {
      await ctx.reply("Распределение задач может оформить только отсутствующий сотрудник.");
      return true;
    }

    const currentTask = pending.tasks[pending.index];
    if (!currentTask) {
      clearPendingAbsenceDelegation(telegramUserId);
      await ctx.reply("Ошибка распределения. Повторите команду.");
      return true;
    }

    if (isDelegationKeepItemAnswer(text)) {
      await advanceAfterAssignment(
        ctx,
        telegramUserId,
        pending,
        assignmentKeep(currentTask.id),
      );
      return true;
    }

    const users = await fetchUsers();
    const absenceUser = users.find((u) => u.id === pending.absenceUserId) ?? linked;

    const resolved = await resolveUserHintWithSelection(
      ctx,
      telegramUserId,
      users,
      text,
      absenceUser,
      "select_user_for_absence_delegation_item",
      {
        intent: "absence_delegation_item",
        absenceId: pending.absenceId,
        absenceUserId: pending.absenceUserId,
        absenceUserName: pending.absenceUserName,
        absenceType: pending.absenceType,
        startDate: pending.startDate,
        endDate: pending.endDate,
        tasks: pending.tasks,
        index: pending.index,
        assignments: pending.assignments,
      },
    );

    if (resolved.status === "selection_started" || resolved.status === "not_found") {
      return true;
    }

    if (resolved.status === "resolved") {
      if (resolved.user.id === pending.absenceUserId) {
        await advanceAfterAssignment(
          ctx,
          telegramUserId,
          pending,
          assignmentKeep(currentTask.id),
        );
        return true;
      }

      if (!resolved.user.telegramId) {
        await ctx.reply(
          `У сотрудника ${resolved.user.fullName} не привязан Telegram. Выберите другого сотрудника или напишите «оставить».`,
        );
        return true;
      }

      await advanceAfterAssignment(
        ctx,
        telegramUserId,
        pending,
        assignmentTransfer(currentTask.id, resolved.user),
      );
      return true;
    }

    await ctx.reply("Напишите «мне» / «оставить» или имя сотрудника.");
    return true;
  }

  return false;
}
