import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { fetchUsers } from "./api";
import {
  continueReassignAfterUsersResolved,
  MANAGER_REASSIGN_ONLY_MESSAGE,
} from "./task-reassign-flow";
import { isManagerOrOwner } from "./task-transfer-flow";
import { isSelfHint, SELF_HINT_MARKER } from "./resolve-users-by-hint";
import {
  buildUserSelectionPayload,
  resolveUserHintWithSelection,
} from "./user-hint-resolution";
import type { ReassignUserSelectionPayload } from "./pending-user-selection";

function isSelfUserHint(hint: string | undefined): boolean {
  const t = hint?.trim();
  if (!t) return false;
  return t === SELF_HINT_MARKER || isSelfHint(t);
}

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
  const reassignToSelf = isSelfUserHint(toUserHint);

  let fromUser: ApiUser | undefined;

  const effectiveFromHint =
    fromUserHint?.trim() && !(reassignToSelf && isSelfUserHint(fromUserHint))
      ? fromUserHint
      : undefined;

  if (effectiveFromHint?.trim()) {
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
      effectiveFromHint,
      linked,
      "select_user_for_reassign_from",
      fromPayload,
      intent.payload.fromUserId,
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
    intent.payload.toUserId,
  );
  if (toResolution.status !== "resolved") return;

  let effectiveFromUser = fromUser;
  if (
    reassignToSelf &&
    effectiveFromUser &&
    effectiveFromUser.id === toResolution.user.id
  ) {
    effectiveFromUser = undefined;
  }

  await continueReassignAfterUsersResolved(ctx, linked, telegramUserId, intent, taskTitle, toResolution.user, {
    fromUser: effectiveFromUser,
    comment,
  });
}
