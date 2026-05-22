import type { Context } from "grammy";
import { isConfirmationNo, isConfirmationYes } from "./confirmation";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import {
  clearPendingAbsenceDelegation,
  getPendingAbsenceDelegation,
  isPendingAbsenceDelegationExpired,
  startPendingAbsenceDelegationAssignee,
  startPendingAbsenceDelegationConfirm,
} from "./pending-absence-delegation";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import { executeAbsenceDelegationTransfers } from "./absence-impact-flow";
import { fetchUsers } from "./api";
import { resolveUserHintWithSelection } from "./user-hint-resolution";

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

  if (pending.type === "pending_absence_delegation") {
    if (isPendingDetailsCancel(text) || isConfirmationNo(text)) {
      clearPendingAbsenceDelegation(telegramUserId);
      await ctx.reply("Ок, задачи остаются за вами.");
      return true;
    }

    if (isConfirmationYes(text)) {
      startPendingAbsenceDelegationAssignee(telegramUserId, {
        absenceId: pending.absenceId,
        absenceUserId: pending.absenceUserId,
        absenceUserName: pending.absenceUserName,
        absenceType: pending.absenceType,
        startDate: pending.startDate,
        endDate: pending.endDate,
        affectedTasks: pending.affectedTasks,
      });
      await ctx.reply("Кому передать задачи?");
      return true;
    }

    await ctx.reply("Ответьте: да / нет");
    return true;
  }

  if (pending.type === "awaiting_absence_delegation_assignee") {
    if (isPendingDetailsCancel(text)) {
      clearPendingAbsenceDelegation(telegramUserId);
      await ctx.reply("Ок, задачи остаются за вами.");
      return true;
    }

    const linked = await getLinkedUserByTelegramId(telegramUserId);
    if (!linked) {
      clearPendingAbsenceDelegation(telegramUserId);
      await ctx.reply(NOT_LINKED_MESSAGE);
      return true;
    }

    const users = await fetchUsers();
    const resolved = await resolveUserHintWithSelection(
      ctx,
      telegramUserId,
      users,
      text,
      linked,
      "select_user_for_absence_delegation",
      {
        intent: "absence_delegation",
        absenceId: pending.absenceId,
        absenceUserId: pending.absenceUserId,
        absenceUserName: pending.absenceUserName,
        absenceType: pending.absenceType,
        startDate: pending.startDate,
        endDate: pending.endDate,
        affectedTaskIds: pending.affectedTasks.map((t) => t.id),
        affectedTasks: pending.affectedTasks,
      },
    );

    if (resolved.status === "selection_started") {
      return true;
    }

    if (resolved.status === "not_found") {
      return true;
    }

    if (resolved.status === "resolved") {
      const selected = resolved.user;
      const taskLines = pending.affectedTasks
        .map((t, i) => `${i + 1}. ${t.title}`)
        .join("\n");
      startPendingAbsenceDelegationConfirm(telegramUserId, {
        absenceId: pending.absenceId,
        absenceUserId: pending.absenceUserId,
        absenceType: pending.absenceType,
        startDate: pending.startDate,
        endDate: pending.endDate,
        affectedTasks: pending.affectedTasks,
        toUserId: selected.id,
        toUserName: selected.fullName,
        toUserTelegramId: selected.telegramId ?? null,
      });
      await ctx.reply(
        [
          `Передать задачи сотруднику ${selected.fullName}?`,
          "",
          taskLines,
          "",
          "Ответьте: да / нет",
        ].join("\n"),
      );
      return true;
    }

    await ctx.reply("Напишите имя сотрудника.");
    return true;
  }

  if (pending.type === "confirm_absence_delegation") {
    if (isPendingDetailsCancel(text) || isConfirmationNo(text)) {
      clearPendingAbsenceDelegation(telegramUserId);
      await ctx.reply("Ок, задачи остаются за вами.");
      return true;
    }

    if (isConfirmationYes(text)) {
      clearPendingAbsenceDelegation(telegramUserId);
      const linked = await getLinkedUserByTelegramId(telegramUserId);
      if (!linked) {
        await ctx.reply(NOT_LINKED_MESSAGE);
        return true;
      }

      const users = await fetchUsers();
      const toUser = users.find((u) => u.id === pending.toUserId);
      if (!toUser) {
        await ctx.reply("Сотрудник не найден. Повторите команду.");
        return true;
      }

      try {
        const reply = await executeAbsenceDelegationTransfers(ctx.api, {
          absenceId: pending.absenceId,
          absenceUserId: pending.absenceUserId,
          absenceUserName: linked.fullName,
          absenceType: pending.absenceType,
          startDate: pending.startDate,
          endDate: pending.endDate,
          toUser,
          affectedTasks: pending.affectedTasks,
        });
        await ctx.reply(reply);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
      }
      return true;
    }

    await ctx.reply("Ответьте: да / нет");
    return true;
  }

  return false;
}
