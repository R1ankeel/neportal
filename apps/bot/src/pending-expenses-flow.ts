import type { Context } from "grammy";
import {
  fetchPendingExpenses,
  formatMoney,
  parseAmount,
  type ApiPendingExpense,
} from "./api";
import type { ApiUser } from "./api";
import { formatIsoDateRu } from "./parse-ru-date";
import {
  startPendingExpenseReceiptSelection,
  type PendingExpenseCandidate,
} from "./pending-expense-receipt-selection";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";

export function formatExpenseDescription(description: string | null | undefined): string {
  const trimmed = description?.trim();
  return trimmed ? trimmed : "без описания";
}

export function formatExpenseCreatedDate(createdAt: string): string {
  const iso = createdAt.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return formatIsoDateRu(iso);
  }
  return createdAt;
}

function toCandidate(expense: ApiPendingExpense): PendingExpenseCandidate {
  return {
    id: expense.id,
    amount: parseAmount(expense.amount),
    description: expense.description,
    createdAt: expense.createdAt,
    budgetName: expense.budget.name,
    projectName: expense.budget.project?.name ?? "—",
  };
}

export function formatPendingExpensesList(expenses: PendingExpenseCandidate[]): string {
  const lines = ["Ваши неподтверждённые расходы:", ""];

  expenses.forEach((expense, index) => {
    const amountLabel = formatMoney(expense.amount);
    const descriptionLabel = formatExpenseDescription(expense.description);
    lines.push(
      `${index + 1}. ${amountLabel} — ${descriptionLabel}`,
      `   Бюджет: ${expense.budgetName}`,
      `   Проект: ${expense.projectName}`,
      `   Дата: ${formatExpenseCreatedDate(expense.createdAt)}`,
    );
    if (index < expenses.length - 1) {
      lines.push("");
    }
  });

  lines.push(
    "",
    "Выберите расход кнопкой ниже или отправьте номер. Для отмены напишите «отмена».",
  );
  return lines.join("\n");
}

export async function showPendingExpenses(
  ctx: Context,
  currentUser: ApiUser,
  telegramUserId: number,
  limit = 10,
): Promise<void> {
  const expenses = await fetchPendingExpenses(currentUser.id, limit);

  if (expenses.length === 0) {
    await ctx.reply("У вас нет неподтверждённых расходов.");
    return;
  }

  const candidates = expenses.map(toCandidate);
  startPendingExpenseReceiptSelection(telegramUserId, candidates);
  await replyWithActiveChoiceKeyboard(ctx, telegramUserId, formatPendingExpensesList(candidates));
}

export function formatReceiptUploadPrompt(amount: number, description: string | null | undefined): string {
  const amountLabel = formatMoney(amount);
  const descriptionLabel = formatExpenseDescription(description);
  return `Отправьте фото или документ чека для расхода ${amountLabel} — ${descriptionLabel}.`;
}
