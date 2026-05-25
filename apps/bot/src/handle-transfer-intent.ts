import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { fetchUsers } from "./api";
import { replyWithIntentPreview } from "./intent-preview";
import { setPendingConfirmation } from "./pending-intent";
import type { TaskSelectionPayload } from "./pending-task-selection";
import {
  buildResolvedTransferTask,
  canTransferTask,
  requiresTransferApproval,
  startPendingTaskTransferComment,
} from "./task-transfer-flow";
import {
  buildUserSelectionPayload,
  resolveUserHintWithSelection,
} from "./user-hint-resolution";
import { resolveResultToMessage, resolveTaskByTitle } from "./resolve-task-by-title";

export async function handleTransferTaskIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
): Promise<void> {
  if (intent.intent !== "transfer_task") return;

  const users = await fetchUsers();
  const userSelectionPayload = buildUserSelectionPayload(intent, linked);
  if (!userSelectionPayload || userSelectionPayload.intent !== "transfer_task") {
    await ctx.reply("Не удалось обработать команду.");
    return;
  }

  const userResolution = await resolveUserHintWithSelection(
    ctx,
    telegramUserId,
    users,
    intent.payload.toUserHint,
    linked,
    "select_user_for_transfer",
    userSelectionPayload,
    intent.payload.toUserId,
  );
  if (userResolution.status !== "resolved") return;

  const toUser = userResolution.user;
  const taskSelectionPayload: TaskSelectionPayload = {
    toUserId: toUser.id,
    toUserName: toUser.fullName,
  };
  if (intent.payload.comment?.trim()) {
    taskSelectionPayload.transferComment = intent.payload.comment.trim();
  }

  const resolution = await resolveTaskByTitle(
    linked,
    intent.payload.taskTitle,
    "transfer",
    { telegramUserId, selectionPayload: taskSelectionPayload },
  );

  if (resolution.kind !== "found") {
    await ctx.reply(resolveResultToMessage(resolution));
    return;
  }

  const task = resolution.task;
  if (!canTransferTask(linked, task)) {
    await ctx.reply("Вы не можете передать эту задачу.");
    return;
  }

  if (task.assigneeId === toUser.id) {
    await ctx.reply("Сотрудник уже назначен на эту задачу.");
    return;
  }

  if (requiresTransferApproval(linked.role) && !toUser.telegramId) {
    await ctx.reply(
      `Нельзя запросить передачу: Telegram у сотрудника ${toUser.fullName} не привязан.`,
    );
    return;
  }

  if (taskSelectionPayload.transferComment) {
    const resolved = buildResolvedTransferTask(
      task,
      toUser,
      taskSelectionPayload.transferComment,
      linked.role,
    );
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent,
      resolved,
    });
    await replyWithIntentPreview(ctx, telegramUserId, resolved);
    return;
  }

  const question = startPendingTaskTransferComment(telegramUserId, task, toUser);
  await ctx.reply(question);
}
