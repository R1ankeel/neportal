import type { Context } from "grammy";
import {
  apiBudgetToCandidate,
  filterActiveAccessibleBudgets,
} from "./budget-resolver";
import { formatBudgetSelectionMessage } from "./budget-selection-format";
import type { ApiUser } from "./api";
import { fetchBudgets } from "./api";
import type { ResolvedCreateExpense } from "./intent-resolver";
import { getPendingConfirmation } from "./pending-intent";
import { startPendingBudgetSelection } from "./pending-budget-selection";

export async function startBudgetSelectionFromExpenseConfirmation(
  ctx: Context,
  telegramUserId: number,
  linked: ApiUser,
  resolved: ResolvedCreateExpense,
): Promise<void> {
  const budgets = await fetchBudgets(resolved.project.id, linked.id);
  const accessible = filterActiveAccessibleBudgets(budgets);

  if (accessible.length <= 1) {
    await ctx.reply(
      "Других доступных бюджетов нет. Напишите «изменить», чтобы поправить расход, или «отмена», чтобы не добавлять.",
    );
    return;
  }

  const pending = getPendingConfirmation(telegramUserId);
  const budgetHint =
    pending?.type === "ai_intent" && pending.intent.intent === "create_expense"
      ? pending.intent.payload.budgetHint
      : undefined;

  startPendingBudgetSelection(telegramUserId, {
    candidates: accessible.map(apiBudgetToCandidate),
    payload: {
      amount: resolved.amount,
      description: resolved.description,
      projectId: resolved.project.id,
      projectName: resolved.project.name,
      userId: resolved.userId,
      budgetHint,
      previousBudgetId: resolved.budget.id,
      source: "TELEGRAM_TEXT",
    },
  });

  await ctx.reply(
    formatBudgetSelectionMessage(accessible.map(apiBudgetToCandidate), {
      fromConfirmation: true,
    }),
  );
}
