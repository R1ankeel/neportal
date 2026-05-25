import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import { createAbsenceWithImpact } from "./absence-impact-flow";
import { fetchUsers } from "./api";
import { requireLinkedUser } from "./current-user";
import { replyWithIntentPreview } from "./intent-preview";
import { resolveIntent } from "./intent-resolver";
import { setPendingConfirmation } from "./pending-intent";
import {
  apiUserToCandidate,
  startPendingUserSelection,
} from "./pending-user-selection";
import { formatIsoDateRu, parseRuDate, todayIsoDate } from "./parse-ru-date";
import { resolveUsersByHint } from "./resolve-users-by-hint";
import { formatUserCandidates, userNotFoundMessage } from "./user-selection-format";

export function parseSickSlashPayload(
  payload: string,
): { endIso: string; documentNumber?: string; userHint?: string } | null {
  const trimmed = payload.trim();

  const withUser = trimmed.match(
    /^(?:для\s+)?(.+?)\s+до\s+(\d{1,2}\.\d{1,2}\.\d{4})(?:\s+номер\s+(\S+))?$/iu,
  );
  if (withUser) {
    const endIso = parseRuDate(withUser[2]);
    if (!endIso) return null;
    const userHint = withUser[1].trim();
    if (!userHint) return null;
    return {
      endIso,
      documentNumber: withUser[3]?.trim() || undefined,
      userHint,
    };
  }

  const m = trimmed.match(/^(?:до\s+)?(\d{1,2}\.\d{1,2}\.\d{4})(?:\s+номер\s+(\S+))?$/iu);
  if (!m) return null;
  const endIso = parseRuDate(m[1]);
  if (!endIso) return null;
  return { endIso, documentNumber: m[2]?.trim() || undefined };
}

export function parseVacationSlashPayload(
  payload: string,
): { startIso: string; endIso: string; userHint?: string } | null {
  const trimmed = payload.trim();

  const withUser = trimmed.match(
    /^(?:для\s+)?(.+?)\s+с\s+(\d{1,2}\.\d{1,2}\.\d{4})\s+по\s+(\d{1,2}\.\d{1,2}\.\d{4})$/iu,
  );
  if (withUser) {
    const startIso = parseRuDate(withUser[2]);
    const endIso = parseRuDate(withUser[3]);
    const userHint = withUser[1].trim();
    if (!startIso || !endIso || !userHint) return null;
    return { startIso, endIso, userHint };
  }

  const m =
    trimmed.match(/^с\s+(\d{1,2}\.\d{1,2}\.\d{4})\s+по\s+(\d{1,2}\.\d{1,2}\.\d{4})$/iu) ??
    trimmed.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{1,2}\.\d{1,2}\.\d{4})$/iu);
  if (!m) return null;
  const startIso = parseRuDate(m[1]);
  const endIso = parseRuDate(m[2]);
  if (!startIso || !endIso) return null;
  return { startIso, endIso };
}

async function confirmCreateAbsence(
  ctx: Context,
  telegramUserId: number,
  params: {
    userId: string;
    userFullName: string;
    type: "SICK_LEAVE" | "VACATION";
    startDate: string;
    endDate: string;
    documentNumber?: string;
  },
): Promise<void> {
  const syntheticIntent: AiIntent = {
    intent: "create_absence",
    confidence: 1,
    requiresConfirmation: true,
    payload: {
      userHint: params.userFullName,
      type: params.type,
      startDate: params.startDate,
      endDate: params.endDate,
      documentNumber: params.documentNumber,
    },
  };

  const resolvedResult = await resolveIntent(
    syntheticIntent,
    telegramUserId,
    undefined,
    { absenceUserId: params.userId },
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
}

export async function handleSickSlashCommand(ctx: Context, payload: string): Promise<void> {
  const parsed = parseSickSlashPayload(payload);
  if (!parsed) {
    await ctx.reply("Использование: /sick до 25.05.2026 номер 123456");
    return;
  }

  const { endIso, documentNumber, userHint } = parsed;
  const startIso = todayIsoDate();
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  const currentUser = await requireLinkedUser(ctx);
  if (!currentUser) return;

  if (!userHint) {
    await createAbsenceWithImpact(
      ctx.api,
      {
        userId: currentUser.id,
        type: "SICK_LEAVE",
        startDate: startIso,
        endDate: endIso,
        documentNumber,
        status: "APPROVED",
      },
      currentUser,
    );
    await ctx.reply(
      [
        `Больничный добавлен: с ${formatIsoDateRu(startIso)} по ${formatIsoDateRu(endIso)}.`,
        `Номер: ${documentNumber ?? "не указан"}.`,
      ].join("\n"),
    );
    return;
  }

  const users = await fetchUsers();
  const match = resolveUsersByHint(users, userHint, currentUser);
  if (match.kind === "none") {
    await ctx.reply(userNotFoundMessage(userHint));
    return;
  }
  if (match.kind === "many") {
    startPendingUserSelection(telegramUserId, "select_user_for_absence", match.users.map(apiUserToCandidate), {
      intent: "create_absence",
      type: "SICK_LEAVE",
      startDate: startIso,
      endDate: endIso,
      documentNumber,
    });
    await ctx.reply(formatUserCandidates(match.users.map(apiUserToCandidate)));
    return;
  }

  await confirmCreateAbsence(ctx, telegramUserId, {
    userId: match.user.id,
    userFullName: match.user.fullName,
    type: "SICK_LEAVE",
    startDate: startIso,
    endDate: endIso,
    documentNumber,
  });
}

export async function handleVacationSlashCommand(ctx: Context, payload: string): Promise<void> {
  const parsed = parseVacationSlashPayload(payload);
  if (!parsed) {
    await ctx.reply("Использование: /vacation с 01.06.2026 по 10.06.2026");
    return;
  }

  const { startIso, endIso, userHint } = parsed;
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  const currentUser = await requireLinkedUser(ctx);
  if (!currentUser) return;

  if (endIso < startIso) {
    await ctx.reply("Дата окончания не может быть раньше даты начала.");
    return;
  }

  if (!userHint) {
    await createAbsenceWithImpact(
      ctx.api,
      {
        userId: currentUser.id,
        type: "VACATION",
        startDate: startIso,
        endDate: endIso,
        status: "APPROVED",
      },
      currentUser,
    );
    await ctx.reply(`Отпуск добавлен: с ${formatIsoDateRu(startIso)} по ${formatIsoDateRu(endIso)}.`);
    return;
  }

  const users = await fetchUsers();
  const match = resolveUsersByHint(users, userHint, currentUser);
  if (match.kind === "none") {
    await ctx.reply(userNotFoundMessage(userHint));
    return;
  }
  if (match.kind === "many") {
    startPendingUserSelection(telegramUserId, "select_user_for_absence", match.users.map(apiUserToCandidate), {
      intent: "create_absence",
      type: "VACATION",
      startDate: startIso,
      endDate: endIso,
    });
    await ctx.reply(formatUserCandidates(match.users.map(apiUserToCandidate)));
    return;
  }

  await confirmCreateAbsence(ctx, telegramUserId, {
    userId: match.user.id,
    userFullName: match.user.fullName,
    type: "VACATION",
    startDate: startIso,
    endDate: endIso,
  });
}
