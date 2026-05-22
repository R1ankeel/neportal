import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { fetchUsers } from "./api";
import { buildIntentPreview } from "./intent-preview";
import { setPendingConfirmation } from "./pending-intent";
import type { TaskSelectionPayload } from "./pending-task-selection";
import {
  buildResolvedTransferTask,
  canTransferTask,
  requiresTransferApproval,
  resolveTransferTargetUser,
  startPendingTaskTransferComment,
} from "./task-transfer-flow";
import { resolveResultToMessage, resolveTaskByTitle } from "./resolve-task-by-title";

export async function handleTransferTaskIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
): Promise<void> {
  if (intent.intent !== "transfer_task") return;

  const users = await fetchUsers();
  const userMatch = resolveTransferTargetUser(users, intent.payload.toUserHint);
  if (userMatch.kind === "none" || userMatch.kind === "many") {
    await ctx.reply(userMatch.message ?? "Не удалось найти сотрудника.");
    return;
  }

  const toUser = userMatch.user;
  const selectionPayload: TaskSelectionPayload = {
    toUserId: toUser.id,
    toUserName: toUser.fullName,
  };
  if (intent.payload.comment?.trim()) {
    selectionPayload.transferComment = intent.payload.comment.trim();
  }

  const resolution = await resolveTaskByTitle(
    linked,
    intent.payload.taskTitle,
    "transfer",
    { telegramUserId, selectionPayload },
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

  if (selectionPayload.transferComment) {
    const resolved = buildResolvedTransferTask(
      task,
      toUser,
      selectionPayload.transferComment,
      linked.role,
    );
    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent,
      resolved,
    });
    await ctx.reply(buildIntentPreview(resolved));
    return;
  }

  const question = startPendingTaskTransferComment(telegramUserId, task, toUser);
  await ctx.reply(question);
}
