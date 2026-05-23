import type { Context } from "grammy";
import { continueCancelAbsenceForUser } from "./absence-cancel-flow";
import { fetchUsers } from "./api";
import { requireLinkedUser } from "./current-user";
import {
  apiUserToCandidate,
  startPendingUserSelection,
} from "./pending-user-selection";
import { resolveUsersByHint } from "./resolve-users-by-hint";
import { formatUserCandidates, userNotFoundMessage } from "./user-selection-format";

export async function handleCancelAbsenceSlashCommand(
  ctx: Context,
  payload: string,
): Promise<void> {
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  const currentUser = await requireLinkedUser(ctx);
  if (!currentUser) return;

  const userHint = payload.trim();
  if (!userHint) {
    await continueCancelAbsenceForUser(ctx, telegramUserId, currentUser, currentUser);
    return;
  }

  const users = await fetchUsers();
  const match = resolveUsersByHint(users, userHint, currentUser);
  if (match.kind === "none") {
    await ctx.reply(userNotFoundMessage(userHint));
    return;
  }
  if (match.kind === "many") {
    startPendingUserSelection(
      telegramUserId,
      "select_user_for_absence_cancel",
      match.users.map(apiUserToCandidate),
      { intent: "cancel_absence" },
    );
    await ctx.reply(formatUserCandidates(match.users.map(apiUserToCandidate)));
    return;
  }

  await continueCancelAbsenceForUser(ctx, telegramUserId, currentUser, match.user);
}
