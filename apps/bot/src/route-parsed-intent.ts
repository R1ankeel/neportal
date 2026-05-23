import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { fetchProjects, fetchUsers } from "./api";
import { handleCancelAbsenceIntent } from "./absence-cancel-flow";
import { beginCreateExpenseFromAiIntent } from "./create-expense-flow";
import { questionForCreateTaskAssignee } from "./create-task-assignee-flow";
import { buildIntentPreview } from "./intent-preview";
import { resolveIntent } from "./intent-resolver";
import { handleAddTaskCommentIntent } from "./handle-task-comment-intent";
import { handleMentionInTaskIntent } from "./handle-mention-intent";
import { handleReassignTaskIntent } from "./handle-reassign-intent";
import { handleTransferTaskIntent } from "./handle-transfer-intent";
import { handleTaskActionIntent } from "./handle-task-intent";
import { findProjectByHint } from "./hint-matchers";
import { formatMyTasksReply, replyWithTasksForHint } from "./my-tasks-flow";
import { startPendingCreateTaskAssignee } from "./pending-create-task-assignee";
import { setPendingConfirmation } from "./pending-intent";
import { tryHandleAmbiguousUserHintBeforeResolve } from "./user-hint-resolution";

const CONFIDENCE_THRESHOLD = 0.7;

/** Общая маршрутизация после разбора intent (LLM или детерминированный парсер). */
export async function routeParsedAiIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  text: string,
  intent: AiIntent,
): Promise<void> {
  if (intent.intent === "unknown" || intent.confidence < CONFIDENCE_THRESHOLD) {
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
    await handleAddTaskCommentIntent(ctx, linked, telegramUserId, intent);
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
      await replyWithTasksForHint(ctx, linked, telegramUserId, intent.payload.userHint, 5);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] list_user_tasks error: ${msg}`);
      await ctx.reply(msg.startsWith("GET /tasks/my") ? `Ошибка API: ${msg}` : `Ошибка: ${msg}`);
    }
    return;
  }

  if (intent.intent === "create_expense") {
    await beginCreateExpenseFromAiIntent(ctx, telegramUserId, linked, intent);
    return;
  }

  if (intent.intent === "create_task" && !intent.payload.assigneeHint?.trim()) {
    const projects = await fetchProjects();
    const project = findProjectByHint(projects, intent.payload.projectHint);
    if (!project) {
      await ctx.reply("Нет проектов. Сначала создайте проект в Web.");
      return;
    }
    startPendingCreateTaskAssignee(telegramUserId, {
      projectHint: intent.payload.projectHint,
      title: intent.payload.title,
      description: intent.payload.description,
      deadlineDate: intent.payload.deadlineDate,
      creatorId: linked.id,
    });
    await ctx.reply(questionForCreateTaskAssignee(intent.payload.title));
    return;
  }

  const users = await fetchUsers();
  if (await tryHandleAmbiguousUserHintBeforeResolve(ctx, linked, telegramUserId, intent, users)) {
    return;
  }

  const resolvedResult = await resolveIntent(intent, telegramUserId, text);
  if (!resolvedResult.ok) {
    await ctx.reply(resolvedResult.message);
    return;
  }

  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent,
    resolved: resolvedResult.resolved,
  });
  await ctx.reply(buildIntentPreview(resolvedResult.resolved));
}
