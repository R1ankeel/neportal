import type { Context } from "grammy";
import { executeAbsenceDelegationDistribution } from "./absence-impact-flow";
import { fetchUsers } from "./api";
import { enterConfirmationEditMode } from "./confirmation-edit";
import { startBudgetSelectionFromExpenseConfirmation } from "./create-expense-confirmation";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { executeResolvedIntent } from "./intent-executor";
import type { ResolvedCreateExpense } from "./intent-resolver";
import {
  clearPendingConfirmation,
  getPendingConfirmation,
  type PendingConfirmation,
} from "./pending-intent";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";

export type ConfirmationDecision = "confirm" | "edit" | "cancel";

export type ConfirmationDecisionResult =
  | { handled: true }
  | { handled: false; reason: "missing" | "unsupported" };

async function confirmAbsenceDelegationDistribution(
  ctx: Context,
  telegramUserId: number,
  pending: Extract<PendingConfirmation, { type: "confirm_absence_delegation_distribution" }>,
): Promise<void> {
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
}

async function confirmAiIntent(
  ctx: Context,
  telegramUserId: number,
  pending: Extract<PendingConfirmation, { type: "ai_intent" }>,
): Promise<void> {
  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingConfirmation(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return;
  }

  clearPendingConfirmation(telegramUserId);
  try {
    const reply = await executeResolvedIntent(pending.resolved, telegramUserId, ctx.api);
    await ctx.reply(reply);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[bot] intent execution error: ${msg}`);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
}

async function cancelAiIntent(
  ctx: Context,
  telegramUserId: number,
  pending: Extract<PendingConfirmation, { type: "ai_intent" }>,
): Promise<void> {
  clearPendingConfirmation(telegramUserId);
  const cancelledExpense = pending.resolved.intent === "create_expense";
  await ctx.reply(cancelledExpense ? "Ок, расход отменён." : "Отменено.");
}

export async function handleConfirmationDecision(
  ctx: Context,
  telegramUserId: number,
  decision: ConfirmationDecision,
): Promise<ConfirmationDecisionResult> {
  const pending = getPendingConfirmation(telegramUserId);
  if (!pending) return { handled: false, reason: "missing" };

  if (decision === "cancel") {
    if (pending.type === "confirm_absence_delegation_distribution") {
      clearPendingConfirmation(telegramUserId);
      await ctx.reply("Ок, задачи остаются за вами.");
      return { handled: true };
    }

    if (pending.type === "ai_intent") {
      await cancelAiIntent(ctx, telegramUserId, pending);
      return { handled: true };
    }

    clearPendingConfirmation(telegramUserId);
    await ctx.reply("Отменено.");
    return { handled: true };
  }

  if (decision === "edit") {
    if (pending.type !== "ai_intent") {
      await ctx.reply("Для этого действия правка пока не поддерживается.");
      return { handled: false, reason: "unsupported" };
    }

    const editMessage = enterConfirmationEditMode(telegramUserId, pending);
    await replyWithActiveChoiceKeyboard(ctx, telegramUserId, editMessage);
    return { handled: true };
  }

  if (pending.type === "confirm_absence_delegation_distribution") {
    await confirmAbsenceDelegationDistribution(ctx, telegramUserId, pending);
    return { handled: true };
  }

  if (pending.type === "ai_intent") {
    await confirmAiIntent(ctx, telegramUserId, pending);
    return { handled: true };
  }

  return { handled: false, reason: "unsupported" };
}

export async function handleCreateExpenseBudgetRejection(
  ctx: Context,
  telegramUserId: number,
  pending: Extract<PendingConfirmation, { type: "ai_intent" }>,
): Promise<void> {
  if (pending.resolved.intent !== "create_expense") {
    clearPendingConfirmation(telegramUserId);
    await ctx.reply("Отменено.");
    return;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingConfirmation(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return;
  }

  clearPendingConfirmation(telegramUserId);
  await startBudgetSelectionFromExpenseConfirmation(
    ctx,
    telegramUserId,
    linked,
    pending.resolved as ResolvedCreateExpense,
  );
}
