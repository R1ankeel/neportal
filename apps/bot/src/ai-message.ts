import type { Context } from "grammy";
import { isConfirmationNo, isConfirmationYes } from "./confirmation";
import {
  getLinkedUserByTelegramId,
  NOT_LINKED_MESSAGE,
} from "./current-user";
import { executeResolvedIntent } from "./intent-executor";
import { buildIntentPreview } from "./intent-preview";
import { resolveIntent } from "./intent-resolver";
import { executeAbsenceDelegationDistribution } from "./absence-impact-flow";
import {
  clearPendingConfirmation,
  getPendingConfirmation,
  setPendingConfirmation,
} from "./pending-intent";
import { fetchUsers } from "./api";
import { handlePendingTaskCommentDetailsMessage } from "./handle-pending-task-comment-details";
import { handlePendingTaskMentionDetailsMessage } from "./handle-pending-task-mention-details";
import { handlePendingTaskStatusDetailsMessage } from "./handle-pending-task-status-details";
import { handlePendingTaskSelectionMessage } from "./handle-pending-task-selection";
import { handlePendingUserSelectionMessage } from "./handle-pending-user-selection";
import { tryHandleAmbiguousUserHintBeforeResolve } from "./user-hint-resolution";
import { fetchProjects } from "./api";
import { questionForCreateTaskAssignee } from "./create-task-assignee-flow";
import { handlePendingCreateTaskAssigneeMessage } from "./handle-pending-create-task-assignee";
import { startPendingCreateTaskAssignee } from "./pending-create-task-assignee";
import { findProjectByHint } from "./hint-matchers";
import { handleAddTaskCommentIntent } from "./handle-task-comment-intent";
import { handleMentionInTaskIntent } from "./handle-mention-intent";
import { handlePendingTaskTransferCommentMessage } from "./handle-pending-task-transfer-comment";
import { handlePendingTaskTransferDecisionMessage } from "./handle-pending-task-transfer-decision";
import { handlePendingTaskTransferRejectionMessage } from "./handle-pending-task-transfer-rejection";
import { handlePendingAbsenceDelegationMessage } from "./handle-pending-absence-delegation";
import { handleTransferTaskIntent } from "./handle-transfer-intent";
import { handleTaskActionIntent } from "./handle-task-intent";
import { formatMyTasksReply, replyWithTasksForHint } from "./my-tasks-flow";
import { handleLinkByUsernameConfirmation } from "./start-binding";
import { getYandexGptState, parseTextIntent } from "./yandex-gpt";

const CONFIDENCE_THRESHOLD = 0.7;

export async function handlePlainTextMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text?.trim();
  const telegramUserId = ctx.from?.id;
  if (!text || !telegramUserId) return;

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
      await ctx.reply("Ожидаю подтверждение. Ответьте: да / нет");
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

    await ctx.reply("Ожидаю подтверждение. Ответьте: да / нет");
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

  const { intent } = parsed;
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
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bot] list_user_tasks error: ${msg}`);
      await ctx.reply(msg.startsWith("GET /tasks/my") ? `Ошибка API: ${msg}` : `Ошибка: ${msg}`);
    }
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
