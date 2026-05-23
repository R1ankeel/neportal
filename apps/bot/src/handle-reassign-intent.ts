import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { fetchUsers } from "./api";
import {
  continueReassignAfterUsersResolved,
  MANAGER_REASSIGN_ONLY_MESSAGE,
} from "./task-reassign-flow";
import { isManagerOrOwner } from "./task-transfer-flow";
import {
  buildUserSelectionPayload,
  resolveUserHintWithSelection,
} from "./user-hint-resolution";
import type { ReassignUserSelectionPayload } from "./pending-user-selection";

export async function handleReassignTaskIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
): Promise<void> {
  if (intent.intent !== "reassign_task") return;

  if (!isManagerOrOwner(linked.role)) {
    await ctx.reply(MANAGER_REASSIGN_ONLY_MESSAGE);
    return;
  }

  const users = await fetchUsers();
  const { taskTitle, fromUserHint, toUserHint, comment } = intent.payload;

  let fromUser: ApiUser | undefined;

  if (fromUserHint?.trim()) {
    const fromPayload: ReassignUserSelectionPayload = {
      intent: "reassign_task",
      taskTitle,
      comment,
      toUserHint,
    };
    const fromResolution = await resolveUserHintWithSelection(
      ctx,
      telegramUserId,
      users,
      fromUserHint,
      linked,
      "select_user_for_reassign_from",
      fromPayload,
    );
    if (fromResolution.status !== "resolved") return;
    fromUser = fromResolution.user;
  }

  const toPayload = buildUserSelectionPayload(intent, linked);
  if (!toPayload || toPayload.intent !== "reassign_task") {
    await ctx.reply("Не удалось обработать команду.");
    return;
  }
  if (fromUser) {
    toPayload.fromUserId = fromUser.id;
    toPayload.fromUserName = fromUser.fullName;
  }

  const toResolution = await resolveUserHintWithSelection(
    ctx,
    telegramUserId,
    users,
    toUserHint,
    linked,
    "select_user_for_reassign_to",
    toPayload,
  );
  if (toResolution.status !== "resolved") return;

  await continueReassignAfterUsersResolved(ctx, linked, telegramUserId, intent, taskTitle, toResolution.user, {
    fromUser,
    comment,
  });
}
