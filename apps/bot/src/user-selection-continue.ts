import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import {
  fetchProjects,
  fetchUsers,
} from "./api";
import { buildIntentPreview } from "./intent-preview";
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
import { linkTelegramUser } from "./api";
import {
  canViewOtherUsersTasks,
  ONLY_OWN_TASKS_MESSAGE,
  replyWithTasksForUser,
} from "./my-tasks-flow";

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
    const projects = await fetchProjects();
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
    await ctx.reply(buildIntentPreview(resolvedResult.resolved));
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
    await ctx.reply(buildIntentPreview(resolvedResult.resolved));
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

  if (payload.intent === "task_list") {
    if (!canViewOtherUsersTasks(linked)) {
      await ctx.reply(ONLY_OWN_TASKS_MESSAGE);
      return;
    }
    await replyWithTasksForUser(ctx, selectedUser, false, payload.limit ?? 5);
  }
}
