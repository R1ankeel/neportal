import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { fetchProjects, fetchUsers } from "./api";
import { handleCancelAbsenceIntent } from "./absence-cancel-flow";
import { beginCreateExpenseFromAiIntent } from "./create-expense-flow";
import { refineCreateTaskIntent } from "./create-task-assignee-extract";
import {
  createTaskAssigneeNeedsClarification,
  resolveCreateTaskAssigneeInIntent,
} from "./create-task-assignee-resolve";
import { questionForCreateTaskAssignee } from "./create-task-assignee-flow";
import { replyWithIntentPreview } from "./intent-preview";
import { resolveIntent } from "./intent-resolver";
import { handleAddTaskCommentIntent } from "./handle-task-comment-intent";
import { handleMentionInTaskIntent } from "./handle-mention-intent";
import { handleReassignTaskIntent } from "./handle-reassign-intent";
import { handleTransferTaskIntent } from "./handle-transfer-intent";
import { handleTaskActionIntent } from "./handle-task-intent";
import { findProjectByHint } from "./hint-matchers";
import { formatMyTasksReply, replyWithTasksForHint } from "./my-tasks-flow";
import { showPendingExpenses } from "./pending-expenses-flow";
import { startPendingCreateTaskAssignee } from "./pending-create-task-assignee";
import { setPendingConfirmation } from "./pending-intent";
import { tryHandleAmbiguousUserHintBeforeResolve } from "./user-hint-resolution";
import { validateIntentForRouting } from "./validate-parsed-intent";

const CONFIDENCE_THRESHOLD = 0.7;

/** Общая маршрутизация после разбора intent (LLM или детерминированный парсер). */
export async function routeParsedAiIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  text: string,
  intent: AiIntent,
): Promise<void> {
  let activeIntent = intent;

  if (activeIntent.intent === "unknown" || activeIntent.confidence < CONFIDENCE_THRESHOLD) {
    await ctx.reply("Не понял команду. Попробуйте переформулировать или используйте /demo.");
    return;
  }

  if (
    intent.intent === "complete_task" ||
    intent.intent === "cancel_task" ||
    intent.intent === "start_task" ||
    intent.intent === "set_task_deadline"
  ) {
    await handleTaskActionIntent(ctx, linked, telegramUserId, intent);
    return;
  }

  if (intent.intent === "add_task_comment") {
    const routing = validateIntentForRouting({ intent: activeIntent, userText: text });
    activeIntent = routing.intent;
    await handleAddTaskCommentIntent(ctx, linked, telegramUserId, activeIntent, {
      userText: text,
    });
    return;
  }

  if (intent.intent === "mention_in_task") {
    await handleMentionInTaskIntent(ctx, linked, telegramUserId, intent);
    return;
  }

  if (intent.intent === "transfer_task") {
    await handleTransferTaskIntent(ctx, linked, telegramUserId, intent);
    return;
  }

  if (intent.intent === "reassign_task") {
    await handleReassignTaskIntent(ctx, linked, telegramUserId, intent);
    return;
  }

  if (intent.intent === "cancel_absence") {
    await handleCancelAbsenceIntent(ctx, linked, telegramUserId, intent, text);
    return;
  }

  if (intent.intent === "list_my_tasks") {
    try {
      const reply = await formatMyTasksReply(linked.id, 5);
      await ctx.reply(reply);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] list_my_tasks error: ${msg}`);
      await ctx.reply(msg.startsWith("GET /tasks/my") ? `Ошибка API: ${msg}` : `Ошибка: ${msg}`);
    }
    return;
  }

  if (intent.intent === "list_user_tasks") {
    try {
      await replyWithTasksForHint(
        ctx,
        linked,
        telegramUserId,
        intent.payload.userHint,
        5,
        intent.payload.userId,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] list_user_tasks error: ${msg}`);
      await ctx.reply(msg.startsWith("GET /tasks/my") ? `Ошибка API: ${msg}` : `Ошибка: ${msg}`);
    }
    return;
  }

  if (intent.intent === "list_pending_expenses") {
    try {
      await showPendingExpenses(ctx, linked, telegramUserId, 10);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] list_pending_expenses error: ${msg}`);
      await ctx.reply(
        msg.startsWith("GET /budget-expenses/pending") ? `Ошибка API: ${msg}` : `Ошибка: ${msg}`,
      );
    }
    return;
  }

  if (intent.intent === "create_expense") {
    await beginCreateExpenseFromAiIntent(ctx, telegramUserId, linked, intent);
    return;
  }

  if (activeIntent.intent === "create_task") {
    const usersForRefine = await fetchUsers();
    activeIntent = refineCreateTaskIntent(activeIntent, usersForRefine, linked, text);
    activeIntent = resolveCreateTaskAssigneeInIntent(activeIntent, linked);
  }

  if (
    activeIntent.intent === "create_task" &&
    createTaskAssigneeNeedsClarification(activeIntent.payload)
  ) {
    const projects = await fetchProjects();
    const project = findProjectByHint(projects, activeIntent.payload.projectHint);
    if (!project) {
      await ctx.reply("Нет проектов. Сначала создайте проект в Web.");
      return;
    }
    startPendingCreateTaskAssignee(telegramUserId, {
      projectHint: activeIntent.payload.projectHint,
      title: activeIntent.payload.title,
      description: activeIntent.payload.description,
      deadlineDate: activeIntent.payload.deadlineDate,
      creatorId: linked.id,
    });
    await ctx.reply(questionForCreateTaskAssignee(activeIntent.payload.title));
    return;
  }

  const users = await fetchUsers();
  if (
    await tryHandleAmbiguousUserHintBeforeResolve(ctx, linked, telegramUserId, activeIntent, users)
  ) {
    return;
  }

  const resolvedResult = await resolveIntent(activeIntent, telegramUserId, text);
  if (!resolvedResult.ok) {
    await ctx.reply(resolvedResult.message);
    return;
  }

  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent: activeIntent,
    resolved: resolvedResult.resolved,
  });
  await replyWithIntentPreview(ctx, telegramUserId, resolvedResult.resolved);
}
