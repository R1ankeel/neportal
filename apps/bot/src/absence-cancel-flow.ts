import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiAbsence, ApiUser } from "./api";
import { cancelAbsence, fetchAbsencesByUserId, fetchUsers } from "./api";
import { formatAbsenceCandidates } from "./absence-selection-format";
import {
  isResolvableNamedUserHint,
  sanitizeAiUserHint,
} from "./fix-ai-intent-absence-user";
import { applyCancelAbsenceUserSelfFix } from "./fix-ai-intent-cancel-absence-user";
import { buildIntentPreview } from "./intent-preview";
import { type ResolvedCancelAbsence } from "./intent-resolver";
import { todayIsoDate } from "./parse-ru-date";
import { setPendingConfirmation } from "./pending-intent";
import {
  type AbsenceCandidate,
  startPendingAbsenceSelection,
} from "./pending-absence-selection";
import { isSelfHint, resolveUsersByHint, SELF_HINT_MARKER } from "./resolve-users-by-hint";
import {
  apiUserToCandidate,
  startPendingUserSelection,
} from "./pending-user-selection";
import { formatUserCandidates, userNotFoundMessage } from "./user-selection-format";

export function canCancelAbsence(actor: ApiUser, absenceUserId: string): boolean {
  if (actor.role === "OWNER" || actor.role === "MANAGER") return true;
  return actor.id === absenceUserId;
}

function startOfTodayUtc(): Date {
  const today = todayIsoDate();
  return new Date(`${today}T00:00:00.000Z`);
}

function endOfTodayUtc(): Date {
  const today = todayIsoDate();
  return new Date(`${today}T23:59:59.999Z`);
}

export function sortAbsencesForCancel(absences: ApiAbsence[]): ApiAbsence[] {
  const todayStart = startOfTodayUtc().getTime();
  const todayEnd = endOfTodayUtc().getTime();

  const rank = (a: ApiAbsence): number => {
    const start = new Date(a.startDate).getTime();
    const end = new Date(a.endDate).getTime();
    if (start <= todayEnd && end >= todayStart) return 0;
    if (start > todayEnd) return 1;
    return 2;
  };

  return [...absences].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1) {
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    }
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });
}

export function absenceToCandidate(absence: ApiAbsence): AbsenceCandidate {
  return {
    id: absence.id,
    type: absence.type,
    startDate: absence.startDate.slice(0, 10),
    endDate: absence.endDate.slice(0, 10),
    userId: absence.user.id,
    userFullName: absence.user.fullName,
  };
}

export async function findCancellableAbsences(
  userId: string,
  type?: "SICK_LEAVE" | "VACATION",
): Promise<ApiAbsence[]> {
  const absences = await fetchAbsencesByUserId(userId);
  const filtered = absences.filter((a) => {
    if (a.status === "CANCELLED") return false;
    if (type && a.type !== type) return false;
    return true;
  });
  return sortAbsencesForCancel(filtered);
}

function notFoundMessage(self: boolean, fullName?: string): string {
  if (self) return "Не нашёл активный больничный или отпуск.";
  return `Не нашёл активный больничный или отпуск у сотрудника ${fullName ?? "сотрудника"}.`;
}

export async function confirmCancelAbsence(
  ctx: Context,
  telegramUserId: number,
  linked: ApiUser,
  absence: AbsenceCandidate,
  cancellationReason?: string,
): Promise<void> {
  if (!canCancelAbsence(linked, absence.userId)) {
    await ctx.reply("Вы не можете удалить это отсутствие.");
    return;
  }

  const syntheticIntent: AiIntent = {
    intent: "cancel_absence",
    confidence: 1,
    requiresConfirmation: true,
    payload: {
      userHint: absence.userFullName,
      type: absence.type,
      ...(cancellationReason ? { cancellationReason } : {}),
    },
  };

  const resolved: ResolvedCancelAbsence = {
    intent: "cancel_absence",
    absenceId: absence.id,
    absenceUserId: absence.userId,
    absenceUserName: absence.userFullName,
    type: absence.type,
    startDate: absence.startDate,
    endDate: absence.endDate,
    cancellationReason,
    cancelledById: linked.id,
  };

  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent: syntheticIntent,
    resolved,
  });
  await ctx.reply(buildIntentPreview(resolved));
}

export async function continueCancelAbsenceForUser(
  ctx: Context,
  telegramUserId: number,
  linked: ApiUser,
  targetUser: ApiUser,
  type?: "SICK_LEAVE" | "VACATION",
  cancellationReason?: string,
): Promise<void> {
  const absences = await findCancellableAbsences(targetUser.id, type);
  const self = targetUser.id === linked.id;

  if (absences.length === 0) {
    await ctx.reply(notFoundMessage(self, targetUser.fullName));
    return;
  }

  if (absences.length === 1) {
    await confirmCancelAbsence(
      ctx,
      telegramUserId,
      linked,
      absenceToCandidate(absences[0]),
      cancellationReason,
    );
    return;
  }

  const candidates = absences.map(absenceToCandidate);
  startPendingAbsenceSelection(telegramUserId, candidates, {
    cancelledById: linked.id,
    cancellationReason,
  });
  await ctx.reply(formatAbsenceCandidates(candidates));
}

export async function handleCancelAbsenceIntent(
  ctx: Context,
  linked: ApiUser,
  telegramUserId: number,
  intent: AiIntent,
  userText?: string,
): Promise<void> {
  if (intent.intent !== "cancel_absence") return;

  const payload = { ...intent.payload } as Record<string, unknown>;
  if (userText) applyCancelAbsenceUserSelfFix(payload, userText);

  const rawHint = sanitizeAiUserHint(payload.userHint as string | undefined);
  const useSelf =
    rawHint === SELF_HINT_MARKER ||
    (rawHint != null && isSelfHint(rawHint)) ||
    !isResolvableNamedUserHint(rawHint);

  const type = payload.type as "SICK_LEAVE" | "VACATION" | undefined;
  const cancellationReason =
    typeof payload.cancellationReason === "string"
      ? payload.cancellationReason.trim() || undefined
      : undefined;

  if (useSelf) {
    await continueCancelAbsenceForUser(
      ctx,
      telegramUserId,
      linked,
      linked,
      type,
      cancellationReason,
    );
    return;
  }

  const users = await fetchUsers();
  const match = resolveUsersByHint(users, rawHint!, linked);
  if (match.kind === "none") {
    await ctx.reply(userNotFoundMessage(rawHint!));
    return;
  }
  if (match.kind === "many") {
    startPendingUserSelection(
      telegramUserId,
      "select_user_for_absence_cancel",
      match.users.map(apiUserToCandidate),
      {
        intent: "cancel_absence",
        type,
        cancellationReason,
      },
    );
    await ctx.reply(formatUserCandidates(match.users.map(apiUserToCandidate)));
    return;
  }

  await continueCancelAbsenceForUser(
    ctx,
    telegramUserId,
    linked,
    match.user,
    type,
    cancellationReason,
  );
}

export async function executeCancelAbsence(resolved: ResolvedCancelAbsence): Promise<string> {
  await cancelAbsence(resolved.absenceId, {
    cancelledById: resolved.cancelledById,
    cancellationReason: resolved.cancellationReason,
  });
  return "Отсутствие удалено.";
}
