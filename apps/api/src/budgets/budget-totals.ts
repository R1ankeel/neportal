import type { BudgetExpenseStatus } from "@neportal/database";

export type BudgetTotals = {
  amount: number;
  confirmedSpent: number;
  pendingSpent: number;
  totalSpent: number;
  confirmedRemaining: number;
  projectedRemaining: number;
  /** @deprecated use confirmedSpent */
  spent: number;
};

type ExpenseAmountRow = {
  amount: unknown;
  status: BudgetExpenseStatus;
};

export function computeBudgetTotals(
  initialAmount: unknown,
  expenses?: ExpenseAmountRow[],
): BudgetTotals {
  const amount = Number(initialAmount);
  let confirmedSpent = 0;
  let pendingSpent = 0;

  for (const e of expenses ?? []) {
    const value = Number(e.amount);
    if (!Number.isFinite(value)) continue;
    if (e.status === "APPROVED") {
      confirmedSpent += value;
    } else if (e.status === "PENDING_RECEIPT") {
      pendingSpent += value;
    }
  }

  const totalSpent = confirmedSpent + pendingSpent;

  return {
    amount,
    confirmedSpent,
    pendingSpent,
    totalSpent,
    confirmedRemaining: amount - confirmedSpent,
    projectedRemaining: amount - totalSpent,
    spent: confirmedSpent,
  };
}

export function withBudgetTotals<T extends { initialAmount: unknown; expenses?: ExpenseAmountRow[] }>(
  budget: T,
): T & { totals: BudgetTotals } {
  return {
    ...budget,
    totals: computeBudgetTotals(budget.initialAmount, budget.expenses),
  };
}
