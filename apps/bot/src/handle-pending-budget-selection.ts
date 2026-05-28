import type { Context } from "grammy";
import { confirmCreateExpenseAfterBudgetSelection } from "./create-expense-flow";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { replyWithIntentPreview } from "./intent-preview";
import type { ApiProject } from "./api";
import { isConfirmationCancel } from "./confirmation";
import { applyFieldEdit } from "./confirmation/apply-field-edit";
import {
  applyConfirmationEditAndReconfirm,
} from "./confirmation-edit";
import {
  getPendingConfirmationEdit,
  setConfirmationEditStep,
} from "./pending-confirmation-edit";
import {
  clearPendingBudgetSelection,
  getPendingBudgetSelection,
  isPendingBudgetSelectionExpired,
} from "./pending-budget-selection";

function parseSelectionNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export async function handlePendingBudgetSelectionMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const pending = getPendingBudgetSelection(telegramUserId);
  if (!pending) return false;

  if (isPendingBudgetSelectionExpired(pending)) {
    clearPendingBudgetSelection(telegramUserId);
    await ctx.reply("Время ожидания истекло. Повторите команду.");
    return true;
  }

  if (isConfirmationCancel(text)) {
    const mode = pending.mode;
    clearPendingBudgetSelection(telegramUserId);
    if (mode === "confirmation_edit") {
      setConfirmationEditStep(telegramUserId, "select_field");
      await ctx.reply("Ок, изменение бюджета отменено.");
      return true;
    }
    await ctx.reply("Ок, расход отменён.");
    return true;
  }

  const num = parseSelectionNumber(text);
  if (num == null || num > pending.candidates.length) {
    await ctx.reply("Напишите номер бюджета из списка.");
    return true;
  }

  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    clearPendingBudgetSelection(telegramUserId);
    await ctx.reply(NOT_LINKED_MESSAGE);
    return true;
  }

  const selected = pending.candidates[num - 1];
  const payload = pending.payload;
  const mode = pending.mode;
  clearPendingBudgetSelection(telegramUserId);

  if (mode === "confirmation_edit") {
    const editPending = getPendingConfirmationEdit(telegramUserId);
    if (!editPending || editPending.originalConfirmation.intent.intent !== "create_expense") {
      await ctx.reply("Сессия редактирования истекла. Повторите команду.");
      return true;
    }
    const applyResult = await applyFieldEdit(
      editPending.originalConfirmation.intent,
      "budget",
      selected.name,
      linked.id,
    );
    if (!applyResult.ok) {
      await ctx.reply(applyResult.message);
      return true;
    }
    await applyConfirmationEditAndReconfirm(
      ctx,
      telegramUserId,
      editPending,
      applyResult.intent,
    );
    return true;
  }

  const project: ApiProject = {
    id: selected.projectId || payload.projectId,
    name: selected.projectName || payload.projectName,
  };
  const resolved = confirmCreateExpenseAfterBudgetSelection(
    telegramUserId,
    project,
    payload,
    selected,
  );

  await replyWithIntentPreview(ctx, telegramUserId, resolved);
  return true;
}
