import type { Context } from "grammy";
import {
  CONFIRM_WAIT_MESSAGE,
  CREATE_EXPENSE_CONFIRM_WAIT_MESSAGE,
  isConfirmationCancel,
  isConfirmationEdit,
  isConfirmationNo,
  isConfirmationYes,
} from "./confirmation";
import {
  handlePendingConfirmationEditMessage,
} from "./confirmation-edit";
import {
  handleConfirmationDecision,
  handleCreateExpenseBudgetRejection,
} from "./confirmation-decision";
import {
  getPendingConfirmation,
} from "./pending-intent";
import { NOT_LINKED_MESSAGE } from "./current-user";
import { getLinkedUserByTelegramId } from "./current-user";
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
import { parseCreateBudgetCommand } from "./parse-create-budget-command";
import { parseTaskReassignQuery } from "./ai/deterministic/parse-task-reassign-query";
import { finalizeBasicCreateTask } from "./finalize-basic-create-task";
import { parseTaskTransferLikeQuery } from "./parse-task-transfer-query";
import { isManagerOrOwner } from "./task-transfer-flow";
import { parseExpenseQuery } from "./parse-expense-query";
import { parseCompletedTaskListQuery } from "./parse-completed-task-list-query";
import { parseTaskCommentsListQuery } from "./parse-task-comments-list-query";
import { parseTaskListQuery } from "./parse-task-list-query";
import { routeParsedAiIntent } from "./route-parsed-intent";
import {
  formatMyCompletedTasksReply,
  replyWithCompletedTasksForHint,
} from "./completed-tasks-flow";
import { replyWithTaskCommentsForHint } from "./task-comments-list-flow";
import { formatMyTasksReply, replyWithTasksForHint } from "./my-tasks-flow";
import { handlePendingExpenseReceiptSelectionMessage } from "./handle-pending-expense-receipt-selection";
import { handlePendingExpenseReceiptUploadMessage } from "./handle-pending-expense-receipt-upload";
import { parsePendingExpensesQuery } from "./parse-pending-expenses-query";
import { showPendingExpenses } from "./pending-expenses-flow";
import { handleLinkByUsernameConfirmation } from "./start-binding";
import { getAiProviderState } from "./ai/provider/registry";
import { parseTextIntent } from "./yandex-gpt";

export type TextMessageSource = "text" | "voice";

export type HandleTextMessageOptions = {
  source?: TextMessageSource;
  recognizedFromVoice?: boolean;
};

export async function handleTextSemanticMessage(
  ctx: Context,
  text: string,
  options?: HandleTextMessageOptions,
): Promise<void> {
  const normalizedText = text.trim();
  const telegramUserId = ctx.from?.id;
  if (!normalizedText || !telegramUserId) return;

  const inputText = normalizedText;

  if (
    await handlePendingConfirmationEditMessage(ctx, telegramUserId, inputText, {
      source: options?.source ?? "text",
    })
  ) {
    return;
  }

  if (await handlePendingExpenseReceiptUploadMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingExpenseReceiptSelectionMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  const pending = getPendingConfirmation(telegramUserId);
  if (pending) {
    if (pending.type === "confirm_link_by_username") {
      await handleLinkByUsernameConfirmation(ctx, pending, inputText, telegramUserId);
      return;
    }

    if (pending.type === "confirm_absence_delegation_distribution") {
      if (isConfirmationNo(inputText)) {
        await handleConfirmationDecision(ctx, telegramUserId, "cancel");
        return;
      }
      if (isConfirmationYes(inputText)) {
        await handleConfirmationDecision(ctx, telegramUserId, "confirm");
        return;
      }
      await ctx.reply(CONFIRM_WAIT_MESSAGE);
      return;
    }

    if (pending.type === "ai_intent" && isConfirmationEdit(inputText)) {
      await handleConfirmationDecision(ctx, telegramUserId, "edit");
      return;
    }

    if (isConfirmationCancel(inputText)) {
      await handleConfirmationDecision(ctx, telegramUserId, "cancel");
      return;
    }

    if (isConfirmationYes(inputText)) {
      await handleConfirmationDecision(ctx, telegramUserId, "confirm");
      return;
    }

    if (isConfirmationNo(inputText)) {
      if (pending.type === "ai_intent" && pending.resolved.intent === "create_expense") {
        await handleCreateExpenseBudgetRejection(ctx, telegramUserId, pending);
        return;
      }

      await handleConfirmationDecision(ctx, telegramUserId, "cancel");
      return;
    }

    const waitMessage =
      pending.type === "ai_intent" && pending.resolved.intent === "create_expense"
        ? CREATE_EXPENSE_CONFIRM_WAIT_MESSAGE
        : CONFIRM_WAIT_MESSAGE;
    await ctx.reply(waitMessage);
    return;
  }

  if (await handlePendingBudgetSelectionMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingTaskStatusDetailsMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingTaskCommentDetailsMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingTaskMentionDetailsMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingTaskTransferCommentMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingTaskTransferRejectionMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingTaskTransferDecisionMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingAbsenceDelegationMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingAbsenceSelectionMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingTaskSelectionMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingCreateTaskAssigneeMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (await handlePendingUserSelectionMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    await ctx.reply(NOT_LINKED_MESSAGE);
    return;
  }

  if (await handlePendingAbsenceDelegationMessage(ctx, telegramUserId, inputText)) {
    return;
  }

  if (parsePendingExpensesQuery(inputText)) {
    try {
      await showPendingExpenses(ctx, linked, telegramUserId, 10);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] list_pending_expenses (deterministic) error: ${msg}`);
      await ctx.reply(
        msg.startsWith("GET /budget-expenses/pending") ? `Ошибка API: ${msg}` : `Ошибка: ${msg}`,
      );
    }
    return;
  }

  const taskCommentsListQuery = parseTaskCommentsListQuery(inputText);
  if (taskCommentsListQuery) {
    try {
      await replyWithTaskCommentsForHint(
        ctx,
        linked,
        telegramUserId,
        taskCommentsListQuery.taskHint,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] list_task_comments (deterministic) error: ${msg}`);
      await ctx.reply(
        msg.includes("GET /tasks/") && msg.includes("/comments")
          ? `Ошибка API: ${msg}`
          : `Ошибка: ${msg}`,
      );
    }
    return;
  }

  const completedTaskListQuery = parseCompletedTaskListQuery(inputText);
  if (completedTaskListQuery?.type === "my") {
    try {
      const reply = await formatMyCompletedTasksReply(linked.id, 5);
      await ctx.reply(reply);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] list_my_completed_tasks (deterministic) error: ${msg}`);
      await ctx.reply(
        msg.startsWith("GET /tasks/completed") ? `Ошибка API: ${msg}` : `Ошибка: ${msg}`,
      );
    }
    return;
  }
  if (completedTaskListQuery?.type === "user") {
    try {
      await replyWithCompletedTasksForHint(
        ctx,
        linked,
        telegramUserId,
        completedTaskListQuery.userHint,
        5,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] list_user_completed_tasks (deterministic) error: ${msg}`);
      await ctx.reply(
        msg.startsWith("GET /tasks/completed") ? `Ошибка API: ${msg}` : `Ошибка: ${msg}`,
      );
    }
    return;
  }

  const taskListQuery = parseTaskListQuery(inputText);
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

  const createBudgetIntent = parseCreateBudgetCommand(inputText);
  if (createBudgetIntent) {
    await routeParsedAiIntent(ctx, linked, telegramUserId, inputText, createBudgetIntent);
    return;
  }

  const expenseIntent = parseExpenseQuery(inputText);
  if (expenseIntent) {
    await routeParsedAiIntent(ctx, linked, telegramUserId, inputText, expenseIntent);
    return;
  }

  const usersForTransfer = await fetchUsers();

  const reassignIntent = parseTaskReassignQuery(inputText, linked.role, {
    users: usersForTransfer,
    currentUser: linked,
  });
  if (reassignIntent) {
    await routeParsedAiIntent(ctx, linked, telegramUserId, inputText, reassignIntent);
    return;
  }

  const createTaskIntent = await finalizeBasicCreateTask(inputText);
  if (createTaskIntent) {
    await routeParsedAiIntent(ctx, linked, telegramUserId, inputText, createTaskIntent);
    return;
  }

  const transferLikeIntent = parseTaskTransferLikeQuery(inputText, {
    preferReassign: isManagerOrOwner(linked.role),
    users: usersForTransfer,
    currentUser: linked,
  });
  if (transferLikeIntent) {
    await routeParsedAiIntent(ctx, linked, telegramUserId, inputText, transferLikeIntent);
    return;
  }

  const aiState = getAiProviderState();
  if (!aiState.enabled) {
    await ctx.reply("AI-парсер пока не настроен. Используйте команды /demo.");
    return;
  }

  const parsed = await parseTextIntent(inputText, { linkedUserId: linked.id });
  if (!parsed.ok) {
    if (parsed.kind === "disabled") {
      await ctx.reply("AI-парсер пока не настроен. Используйте команды /demo.");
      return;
    }
    if (parsed.kind === "invalid_json" || parsed.kind === "invalid_schema") {
      await ctx.reply("Не смог разобрать команду. Попробуйте сформулировать иначе.");
      return;
    }
    await ctx.reply("Не удалось обратиться к AI. Попробуйте позже или используйте /demo.");
    return;
  }

  await routeParsedAiIntent(ctx, linked, telegramUserId, inputText, parsed.intent);
}

export async function handlePlainTextMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  await handleTextSemanticMessage(ctx, text, { source: "text", recognizedFromVoice: false });
}
