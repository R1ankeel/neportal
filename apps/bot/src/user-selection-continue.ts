import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import {
  fetchProjects,
  fetchUsers,
} from "./api";
import { replyWithIntentPreview } from "./intent-preview";
import {
  resolveIntent,
  type ResolveIntentOverrides,
} from "./intent-resolver";
import { setPendingConfirmation } from "./pending-intent";
import type {
  PendingUserSelectionType,
  UserCandidate,
  UserSelectionPayload,
} from "./pending-user-selection";
import { getLinkedUserByTelegramId } from "./current-user";
import { findProjectByHint } from "./hint-matchers";
import { todayIsoDate } from "./parse-ru-date";
import { handleMentionInTaskIntent } from "./handle-mention-intent";
import { handleTransferTaskIntent } from "./handle-transfer-intent";
import { handleReassignTaskIntent } from "./handle-reassign-intent";
import { continueReassignAfterUsersResolved } from "./task-reassign-flow";
import type { ReassignUserSelectionPayload } from "./pending-user-selection";
import { linkTelegramUser } from "./api";
import {
  advanceAfterAssignment,
  assignmentKeep,
  assignmentTransfer,
} from "./absence-delegation-state";
import {
  startPendingAbsenceDelegationItemAssignee,
  type PendingAbsenceDelegationItemAssignee,
} from "./pending-absence-delegation";
import { replyWithCompletedTasksForUser } from "./completed-tasks-flow";
import {
  canViewOtherUsersTasks,
  ONLY_OWN_TASKS_MESSAGE,
  replyWithTasksForUser,
} from "./my-tasks-flow";
import { continueCancelAbsenceForUser } from "./absence-cancel-flow";
import { buildResolvedAddTaskCommentWithMention } from "./task-comment-flow";
import { resolveTaskByTitle, resolveResultToMessage } from "./resolve-task-by-title";
import { buildAddTaskCommentPayload } from "./add-task-comment-payload";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";

/** После выбора номера сотрудника — продолжить исходный сценарий. */
export async function continueAfterUserSelection(
  ctx: Context,
  telegramUserId: number,
  selected: UserCandidate,
  _selectionType: PendingUserSelectionType,
  payload: UserSelectionPayload,
): Promise<void> {
  const users = await fetchUsers();
  const selectedUser = users.find((u) => u.id === selected.id);
  if (!selectedUser) {
    await ctx.reply("Сотрудник не найден. Повторите команду.");
    return;
  }

  if (payload.intent === "link_telegram") {
    try {
      await linkTelegramUser(selectedUser.id, String(telegramUserId));
      await ctx.reply(`Telegram привязан к сотруднику: ${selectedUser.fullName}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.reply(`Ошибка API: ${msg}`);
    }
    return;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    await ctx.reply("Вы не привязаны ни к какому проекту.");
    return;
  }

  if (payload.intent === "create_task") {
    const projects = await fetchProjects(linked.id);
    const project = findProjectByHint(projects, payload.projectHint);
    if (!project) {
      await ctx.reply("Нет проектов. Сначала создайте проект в Web.");
      return;
    }

    const overrides: ResolveIntentOverrides = { assigneeId: selectedUser.id };
    const syntheticIntent: AiIntent = {
      intent: "create_task",
      confidence: 1,
      requiresConfirmation: true,
      payload: {
        assigneeHint: selectedUser.fullName,
        title: payload.title,
        description: payload.description,
        deadlineDate: payload.deadlineDate,
        projectHint: payload.projectHint,
      },
    };

    const resolvedResult = await resolveIntent(
      syntheticIntent,
      telegramUserId,
      undefined,
      overrides,
    );
    if (!resolvedResult.ok) {
      await ctx.reply(resolvedResult.message);
      return;
    }

    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: syntheticIntent,
      resolved: resolvedResult.resolved,
    });
    await replyWithIntentPreview(ctx, telegramUserId, resolvedResult.resolved);
    return;
  }

  if (payload.intent === "cancel_absence") {
    await continueCancelAbsenceForUser(
      ctx,
      telegramUserId,
      linked,
      selectedUser,
      payload.type,
      payload.cancellationReason,
    );
    return;
  }

  if (payload.intent === "create_absence") {
    const startDate = payload.startDate || todayIsoDate();
    const endDate = payload.endDate;
    if (!endDate) {
      await ctx.reply("Укажите дату окончания отсутствия.");
      return;
    }
    if (endDate < startDate) {
      await ctx.reply("Дата окончания не может быть раньше даты начала.");
      return;
    }

    const overrides: ResolveIntentOverrides = { absenceUserId: selectedUser.id };
    const syntheticIntent: AiIntent = {
      intent: "create_absence",
      confidence: 1,
      requiresConfirmation: true,
      payload: {
        userHint: selectedUser.fullName,
        type: payload.type,
        startDate,
        endDate,
        documentNumber: payload.documentNumber,
        comment: payload.comment,
      },
    };

    const resolvedResult = await resolveIntent(
      syntheticIntent,
      telegramUserId,
      undefined,
      overrides,
    );
    if (!resolvedResult.ok) {
      await ctx.reply(resolvedResult.message);
      return;
    }

    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: syntheticIntent,
      resolved: resolvedResult.resolved,
    });
    await replyWithIntentPreview(ctx, telegramUserId, resolvedResult.resolved);
    return;
  }

  if (payload.intent === "transfer_task") {
    const intent: AiIntent = {
      intent: "transfer_task",
      confidence: 1,
      requiresConfirmation: true,
      payload: {
        taskTitle: payload.taskTitle,
        toUserHint: selectedUser.fullName,
        comment: payload.comment,
      },
    };
    await handleTransferTaskIntent(ctx, linked, telegramUserId, intent);
    return;
  }

  if (payload.intent === "reassign_task") {
    const reassignPayload = payload as ReassignUserSelectionPayload;
    if (_selectionType === "select_user_for_reassign_from") {
      const intent: AiIntent = {
        intent: "reassign_task",
        confidence: 1,
        requiresConfirmation: true,
        payload: {
          taskTitle: reassignPayload.taskTitle,
          fromUserHint: selectedUser.fullName,
          toUserHint: reassignPayload.toUserHint,
          comment: reassignPayload.comment,
        },
      };
      await handleReassignTaskIntent(ctx, linked, telegramUserId, intent);
      return;
    }

    const intent: AiIntent = {
      intent: "reassign_task",
      confidence: 1,
      requiresConfirmation: true,
      payload: {
        taskTitle: reassignPayload.taskTitle,
        fromUserHint: reassignPayload.fromUserName,
        toUserHint: selectedUser.fullName,
        comment: reassignPayload.comment,
      },
    };
    const users = await fetchUsers();
    const fromUser = reassignPayload.fromUserId
      ? users.find((u) => u.id === reassignPayload.fromUserId)
      : undefined;
    await continueReassignAfterUsersResolved(
      ctx,
      linked,
      telegramUserId,
      intent,
      reassignPayload.taskTitle,
      selectedUser,
      { fromUser, comment: reassignPayload.comment },
    );
    return;
  }

  if (payload.intent === "mention_in_task") {
    const intent: AiIntent = {
      intent: "mention_in_task",
      confidence: 1,
      requiresConfirmation: true,
      payload: {
        userHint: selectedUser.fullName,
        taskTitle: payload.taskTitle,
        text: payload.text,
      },
    };
    await handleMentionInTaskIntent(ctx, linked, telegramUserId, intent);
    return;
  }

  if (payload.intent === "absence_delegation_item") {
    const users = await fetchUsers();
    const fullUser = users.find((u) => u.id === selectedUser.id) ?? selectedUser;
    const pendingItem: PendingAbsenceDelegationItemAssignee = {
      type: "awaiting_absence_delegation_item_assignee",
      absenceId: payload.absenceId,
      absenceUserId: payload.absenceUserId,
      absenceUserName: payload.absenceUserName,
      absenceType: payload.absenceType,
      startDate: payload.startDate,
      endDate: payload.endDate,
      tasks: payload.tasks,
      index: payload.index,
      assignments: payload.assignments,
      createdAt: Date.now(),
    };
    const currentTask = payload.tasks[payload.index];
    if (!currentTask) {
      await ctx.reply("Ошибка распределения. Повторите команду.");
      return;
    }

    if (fullUser.id === payload.absenceUserId) {
      await advanceAfterAssignment(
        ctx,
        telegramUserId,
        pendingItem,
        assignmentKeep(currentTask.id),
      );
      return;
    }

    if (!fullUser.telegramId) {
      await ctx.reply(
        `У сотрудника ${fullUser.fullName} не привязан Telegram. Выберите другого сотрудника или напишите «оставить».`,
      );
      startPendingAbsenceDelegationItemAssignee(telegramUserId, {
        absenceId: payload.absenceId,
        absenceUserId: payload.absenceUserId,
        absenceUserName: payload.absenceUserName,
        absenceType: payload.absenceType,
        startDate: payload.startDate,
        endDate: payload.endDate,
        tasks: payload.tasks,
        index: payload.index,
        assignments: payload.assignments,
      });
      return;
    }

    await advanceAfterAssignment(
      ctx,
      telegramUserId,
      pendingItem,
      assignmentTransfer(currentTask.id, fullUser),
    );
    return;
  }

  if (payload.intent === "task_list") {
    if (!canViewOtherUsersTasks(linked)) {
      await ctx.reply(ONLY_OWN_TASKS_MESSAGE);
      return;
    }
    await replyWithTasksForUser(ctx, selectedUser, false, payload.limit ?? 5);
    return;
  }

  if (payload.intent === "completed_task_list") {
    if (!canViewOtherUsersTasks(linked)) {
      await ctx.reply(ONLY_OWN_TASKS_MESSAGE);
      return;
    }
    await replyWithCompletedTasksForUser(ctx, selectedUser, false, payload.limit ?? 5);
    return;
  }

  if (payload.intent === "comment_mention") {
    // selectedUser is the mentioned user; now resolve the task
    const { taskHint, commentText } = payload;

    const selectionPayload = {
      commentText,
      mentionedUserId: selectedUser.id,
      mentionedUserName: selectedUser.fullName,
    };

    const resolution = await resolveTaskByTitle(linked, taskHint, "comment", {
      telegramUserId,
      selectionPayload,
    });

    if (resolution.kind !== "found") {
      await replyWithActiveChoiceKeyboard(
        ctx,
        telegramUserId,
        resolveResultToMessage(resolution),
      );
      return;
    }

    const task = resolution.task;
    const resolved = buildResolvedAddTaskCommentWithMention(task, commentText, selectedUser);

    const intentForPending = {
      intent: "add_task_comment" as const,
      confidence: 1,
      requiresConfirmation: true,
      payload: buildAddTaskCommentPayload({
        taskTitle: task.title,
        comment: commentText,
        mentionedUserId: selectedUser.id,
      }),
    };

    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent: intentForPending,
      resolved,
    });
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
  }
}
