import type { Context } from "grammy";
import {
  CONFIRM_WAIT_MESSAGE,
  isConfirmationEdit,
  isConfirmationNo,
  isConfirmationYes,
} from "./confirmation";
import {
  enterConfirmationEditMode,
  getConfirmationEditHint,
  handlePendingConfirmationEditMessage,
} from "./confirmation-edit";
import {
  getLinkedUserByTelegramId,
  NOT_LINKED_MESSAGE,
} from "./current-user";
import { executeResolvedIntent } from "./intent-executor";
import { executeAbsenceDelegationDistribution } from "./absence-impact-flow";
import {
  clearPendingConfirmation,
  getPendingConfirmation,
} from "./pending-intent";
import { fetchUsers } from "./api";
import { handlePendingTaskCommentDetailsMessage } from "./handle-pending-task-comment-details";
import { handlePendingTaskMentionDetailsMessage } from "./handle-pending-task-mention-details";
import { handlePendingTaskStatusDetailsMessage } from "./handle-pending-task-status-details";
import { handlePendingTaskSelectionMessage } from "./handle-pending-task-selection";
import { handlePendingUserSelectionMessage } from "./handle-pending-user-selection";
import { handlePendingCreateTaskAssigneeMessage } from "./handle-pending-create-task-assignee";
import { handlePendingTaskTransferCommentMessage } from "./handle-pending-task-transfer-comment";
import { handlePendingTaskTransferDecisionMessage } from "./handle-pending-task-transfer-decision";
import { handlePendingTaskTransferRejectionMessage } from "./handle-pending-task-transfer-rejection";
import { handlePendingAbsenceDelegationMessage } from "./handle-pending-absence-delegation";
import { handlePendingAbsenceSelectionMessage } from "./handle-pending-absence-selection";
import { handlePendingBudgetSelectionMessage } from "./handle-pending-budget-selection";
import { parseCreateTaskQuery } from "./parse-create-task-query";
import { parseExpenseQuery } from "./parse-expense-query";
import { parseTaskListQuery } from "./parse-task-list-query";
import { routeParsedAiIntent } from "./route-parsed-intent";
import { formatMyTasksReply, replyWithTasksForHint } from "./my-tasks-flow";
import { handleLinkByUsernameConfirmation } from "./start-binding";
import { getYandexGptState, parseTextIntent } from "./yandex-gpt";

export async function handlePlainTextMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text?.trim();
  const telegramUserId = ctx.from?.id;
  if (!text || !telegramUserId) return;

  if (await handlePendingConfirmationEditMessage(ctx, telegramUserId, text)) {
    return;
  }

  const pending = getPendingConfirmation(telegramUserId);
  if (pending) {
    if (pending.type === "confirm_link_by_username") {
      await handleLinkByUsernameConfirmation(ctx, pending, text, telegramUserId);
      return;
    }

    if (pending.type === "confirm_absence_delegation_distribution") {
      if (isConfirmationNo(text)) {
        clearPendingConfirmation(telegramUserId);
        await ctx.reply("Ок, задачи остаются за вами.");
        return;
      }
      if (isConfirmationYes(text)) {
        const linked = await getLinkedUserByTelegramId(telegramUserId);
        if (!linked) {
          clearPendingConfirmation(telegramUserId);
          await ctx.reply(NOT_LINKED_MESSAGE);
          return;
        }
        const users = await fetchUsers();
        const absenceUser = users.find((u) => u.id === pending.absenceUserId) ?? linked;
        clearPendingConfirmation(telegramUserId);
        try {
          const reply = await executeAbsenceDelegationDistribution(ctx.api, {
            absenceId: pending.absenceId,
            absenceUser,
            absenceType: pending.absenceType,
            startDate: pending.startDate,
            endDate: pending.endDate,
            tasks: pending.tasks,
            assignments: pending.assignments,
          });
          await ctx.reply(reply);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
        }
        return;
      }
      await ctx.reply(CONFIRM_WAIT_MESSAGE);
      return;
    }

    if (pending.type === "ai_intent" && isConfirmationEdit(text)) {
      enterConfirmationEditMode(telegramUserId, pending);
      await ctx.reply(getConfirmationEditHint(pending.intent));
      return;
    }

    if (isConfirmationYes(text)) {
      const linked = await getLinkedUserByTelegramId(telegramUserId);
      if (!linked) {
        clearPendingConfirmation(telegramUserId);
        await ctx.reply(NOT_LINKED_MESSAGE);
        return;
      }

      clearPendingConfirmation(telegramUserId);
      try {
        const reply = await executeResolvedIntent(
          pending.resolved,
          telegramUserId,
          ctx.api,
        );
        await ctx.reply(reply);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[bot] intent execution error: ${msg}`);
        await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
      }
      return;
    }

    if (isConfirmationNo(text)) {
      clearPendingConfirmation(telegramUserId);
      await ctx.reply("Отменено.");
      return;
    }

    await ctx.reply(CONFIRM_WAIT_MESSAGE);
    return;
  }

  if (await handlePendingBudgetSelectionMessage(ctx, telegramUserId, text)) {
    return;
  }

  if (await handlePendingTaskStatusDetailsMessage(ctx, telegramUserId, text)) {
    return;
  }

  if (await handlePendingTaskCommentDetailsMessage(ctx, telegramUserId, text)) {
    return;
  }

  if (await handlePendingTaskMentionDetailsMessage(ctx, telegramUserId, text)) {
    return;
  }

  if (await handlePendingTaskTransferCommentMessage(ctx, telegramUserId, text)) {
    return;
  }

  if (await handlePendingTaskTransferRejectionMessage(ctx, telegramUserId, text)) {
    return;
  }

  if (await handlePendingTaskTransferDecisionMessage(ctx, telegramUserId, text)) {
    return;
  }

  if (await handlePendingAbsenceDelegationMessage(ctx, telegramUserId, text)) {
    return;
  }

  if (await handlePendingAbsenceSelectionMessage(ctx, telegramUserId, text)) {
    return;
  }

  if (await handlePendingTaskSelectionMessage(ctx, telegramUserId, text)) {
    return;
  }

  if (await handlePendingCreateTaskAssigneeMessage(ctx, telegramUserId, text)) {
    return;
  }

  if (await handlePendingUserSelectionMessage(ctx, telegramUserId, text)) {
    return;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    await ctx.reply(NOT_LINKED_MESSAGE);
    return;
  }

  if (await handlePendingAbsenceDelegationMessage(ctx, telegramUserId, text)) {
    return;
  }

  const taskListQuery = parseTaskListQuery(text);
  if (taskListQuery?.type === "my") {
    try {
      const reply = await formatMyTasksReply(linked.id, 5);
      await ctx.reply(reply);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] list_my_tasks (deterministic) error: ${msg}`);
      await ctx.reply(msg.startsWith("GET /tasks/my") ? `Ошибка API: ${msg}` : `Ошибка: ${msg}`);
    }
    return;
  }
  if (taskListQuery?.type === "user") {
    try {
      await replyWithTasksForHint(ctx, linked, telegramUserId, taskListQuery.userHint, 5);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] list_user_tasks (deterministic) error: ${msg}`);
      await ctx.reply(msg.startsWith("GET /tasks/my") ? `Ошибка API: ${msg}` : `Ошибка: ${msg}`);
    }
    return;
  }

  const expenseIntent = parseExpenseQuery(text);
  if (expenseIntent) {
    await routeParsedAiIntent(ctx, linked, telegramUserId, text, expenseIntent);
    return;
  }

  const createTaskIntent = parseCreateTaskQuery(text);
  if (createTaskIntent) {
    await routeParsedAiIntent(ctx, linked, telegramUserId, text, createTaskIntent);
    return;
  }

  const yandexState = getYandexGptState();
  if (!yandexState.enabled) {
    await ctx.reply("AI-парсер пока не настроен. Используйте команды /demo.");
    return;
  }

  const parsed = await parseTextIntent(text);
  if (!parsed.ok) {
    if (parsed.kind === "disabled") {
      await ctx.reply("AI-парсер пока не настроен. Используйте команды /demo.");
      return;
    }
    if (parsed.kind === "invalid_json" || parsed.kind === "invalid_schema") {
      await ctx.reply("Не смог разобрать команду. Попробуйте ещё раз.");
      return;
    }
    await ctx.reply("Не удалось обратиться к AI. Попробуйте позже или используйте /demo.");
    return;
  }

  await routeParsedAiIntent(ctx, linked, telegramUserId, text, parsed.intent);
}
