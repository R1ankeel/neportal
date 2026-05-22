import type { Context } from "grammy";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { parseAbsenceTaskSelectionNumbers } from "./absence-delegation-format";
import {
  clearPendingAbsenceDelegation,
  getPendingAbsenceDelegation,
  isPendingAbsenceDelegationExpired,
  startPendingAbsenceDelegationAssignee,
  type AbsenceDelegationTaskItem,
} from "./pending-absence-delegation";
import { isPendingDetailsCancel } from "./pending-task-status-details";
import { isConfirmationNo } from "./confirmation";
import { fetchUsers } from "./api";
import { resolveUserHintWithSelection } from "./user-hint-resolution";
import { setPendingConfirmation } from "./pending-intent";

const TASK_SELECTION_HINT =
  "Напишите номера задач из списка, например: 1, 3. Или «все» / «нет».";

function selectTasksByNumbers(
  tasks: AbsenceDelegationTaskItem[],
  numbers: number[],
): AbsenceDelegationTaskItem[] {
  return numbers.map((n) => tasks[n - 1]).filter(Boolean);
}

function startAssigneeStep(
  telegramUserId: number,
  pending: {
    absenceId: string;
    absenceUserId: string;
    absenceUserName: string;
    absenceType: "SICK_LEAVE" | "VACATION";
    startDate: string;
    endDate: string;
  },
  selectedTasks: AbsenceDelegationTaskItem[],
): void {
  startPendingAbsenceDelegationAssignee(telegramUserId, {
    ...pending,
    selectedTaskIds: selectedTasks.map((t) => t.id),
    selectedTasks,
  });
}

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

  const baseMeta = {
    absenceId: pending.absenceId,
    absenceUserId: pending.absenceUserId,
    absenceUserName: pending.absenceUserName,
    absenceType: pending.absenceType,
    startDate: pending.startDate,
    endDate: pending.endDate,
  };

  if (pending.type === "awaiting_absence_delegation_task_selection") {
    if (isPendingDetailsCancel(text) || isConfirmationNo(text)) {
      clearPendingAbsenceDelegation(telegramUserId);
      await ctx.reply("Ок, задачи остаются за вами.");
      return true;
    }

    const parsed = parseAbsenceTaskSelectionNumbers(text, pending.tasks.length);
    if (parsed === null) {
      await ctx.reply(TASK_SELECTION_HINT);
      return true;
    }

    const selectedTasks =
      parsed === "all"
        ? pending.tasks
        : selectTasksByNumbers(pending.tasks, parsed);

    if (selectedTasks.length === 0) {
      await ctx.reply(TASK_SELECTION_HINT);
      return true;
    }

    startAssigneeStep(telegramUserId, baseMeta, selectedTasks);
    await ctx.reply("Кому передать выбранные задачи?");
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

    if (linked.id !== pending.absenceUserId) {
      await ctx.reply("Передачу задач из-за отсутствия может оформить только отсутствующий сотрудник.");
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
      "select_user_for_absence_delegation",
      {
        intent: "absence_delegation",
        absenceId: pending.absenceId,
        absenceUserId: pending.absenceUserId,
        absenceUserName: pending.absenceUserName,
        absenceType: pending.absenceType,
        startDate: pending.startDate,
        endDate: pending.endDate,
        selectedTaskIds: pending.selectedTaskIds,
        selectedTasks: pending.selectedTasks,
      },
    );

    if (resolved.status === "selection_started" || resolved.status === "not_found") {
      return true;
    }

    if (resolved.status === "resolved") {
      const selected = resolved.user;
      clearPendingAbsenceDelegation(telegramUserId);

      const taskLines = pending.selectedTasks.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
      setPendingConfirmation(telegramUserId, {
        type: "confirm_absence_delegation",
        ...baseMeta,
        selectedTaskIds: pending.selectedTaskIds,
        selectedTasks: pending.selectedTasks,
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

  return false;
}
