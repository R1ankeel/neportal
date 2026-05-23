import type { ApiBudget, ApiUser } from "./api";
import { budgetTotalsOrFallback } from "./api";

const MATCH_THRESHOLD = 60;

export function normalizeBudgetText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterActiveAccessibleBudgets(budgets: ApiBudget[]): ApiBudget[] {
  return budgets.filter((b) => b.status === "ACTIVE");
}

function scoreHintMatch(budgetTitle: string, hint: string): number {
  const title = normalizeBudgetText(budgetTitle);
  const q = normalizeBudgetText(hint);
  if (!q) return 0;
  if (title === q) return 100;
  if (title.includes(q) || q.includes(title)) return 85;

  const hintWords = q.split(" ").filter((w) => w.length >= 2);
  if (hintWords.length === 0) return 0;
  const titleWords = title.split(" ").filter(Boolean);
  const allInTitle = hintWords.every((w) => title.includes(w));
  const allInHint = titleWords.length > 0 && titleWords.every((w) => q.includes(w));
  if (allInTitle || allInHint) return 70;

  const overlap = hintWords.filter((w) => title.includes(w)).length;
  if (overlap > 0 && overlap >= Math.min(hintWords.length, titleWords.length)) return 65;

  return 0;
}

function scoreDescriptionMatch(budgetTitle: string, description: string): number {
  const title = normalizeBudgetText(budgetTitle);
  const text = normalizeBudgetText(description);
  if (!title || !text) return 0;
  if (text.includes(title)) return 90;

  const titleWords = title.split(" ").filter((w) => w.length >= 2);
  if (titleWords.length === 0) return 0;
  const matched = titleWords.filter((w) => text.includes(w)).length;
  if (matched === titleWords.length) return 75;
  if (matched >= 2 && matched >= titleWords.length - 1) return 68;
  return 0;
}

function pickByScores(
  budgets: ApiBudget[],
  scoreFn: (budget: ApiBudget) => number,
): { kind: "one"; budget: ApiBudget } | { kind: "many"; budgets: ApiBudget[] } | { kind: "none" } {
  const scored = budgets
    .map((b) => ({ budget: b, score: scoreFn(b) }))
    .filter((x) => x.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { kind: "none" };
  if (scored.length === 1) return { kind: "one", budget: scored[0].budget };

  const top = scored[0].score;
  const tied = scored.filter((x) => x.score === top);
  if (tied.length === 1) return { kind: "one", budget: tied[0].budget };
  return { kind: "many", budgets: tied.map((x) => x.budget) };
}

export type BudgetResolveInput = {
  budgets: ApiBudget[];
  budgetHint?: string;
  expenseDescription?: string;
  currentUser: ApiUser;
};

export type BudgetResolveResult =
  | { kind: "resolved"; budget: ApiBudget }
  | {
      kind: "selection";
      candidates: ApiBudget[];
      notFoundHint?: string;
    }
  | { kind: "none"; message: string };

export function resolveBudgetForExpense(input: BudgetResolveInput): BudgetResolveResult {
  const accessible = filterActiveAccessibleBudgets(input.budgets);

  if (accessible.length === 0) {
    return { kind: "none", message: "У вас нет доступных активных бюджетов." };
  }

  const hint = input.budgetHint?.trim();

  if (hint) {
    const byHint = pickByScores(accessible, (b) => scoreHintMatch(b.title, hint));
    if (byHint.kind === "one") {
      return { kind: "resolved", budget: byHint.budget };
    }
    if (byHint.kind === "many") {
      return { kind: "selection", candidates: byHint.budgets };
    }
    return {
      kind: "selection",
      candidates: accessible,
      notFoundHint: hint,
    };
  }

  const description = input.expenseDescription?.trim();
  if (description) {
    const byDescription = pickByScores(accessible, (b) =>
      scoreDescriptionMatch(b.title, description),
    );
    if (byDescription.kind === "one") {
      return { kind: "resolved", budget: byDescription.budget };
    }
    if (byDescription.kind === "many") {
      return { kind: "selection", candidates: byDescription.budgets };
    }
  }

  if (accessible.length === 1) {
    return { kind: "resolved", budget: accessible[0] };
  }

  return { kind: "selection", candidates: accessible };
}

export type BudgetCandidate = {
  id: string;
  name: string;
  projectName: string;
  amount: number;
  confirmedSpent: number;
  pendingSpent: number;
  totalSpent: number;
  projectedRemaining: number;
  requiresReceipt: boolean;
  status: string;
  currency: string;
};

export function apiBudgetToCandidate(budget: ApiBudget): BudgetCandidate {
  const totals = budgetTotalsOrFallback(budget);
  return {
    id: budget.id,
    name: budget.title,
    projectName: budget.project?.name ?? "—",
    amount: totals.amount,
    confirmedSpent: totals.confirmedSpent,
    pendingSpent: totals.pendingSpent,
    totalSpent: totals.totalSpent,
    projectedRemaining: totals.projectedRemaining,
    requiresReceipt: budget.requiresReceipt,
    status: budget.status,
    currency: budget.currency,
  };
}

export function candidateToApiBudget(candidate: BudgetCandidate, project?: { id: string; name: string } | null): ApiBudget {
  return {
    id: candidate.id,
    title: candidate.name,
    initialAmount: candidate.amount,
    spentAmount: candidate.confirmedSpent,
    currency: candidate.currency,
    status: candidate.status,
    requiresReceipt: candidate.requiresReceipt,
    project: project ?? (candidate.projectName !== "—" ? { id: "", name: candidate.projectName } : null),
    totals: {
      amount: candidate.amount,
      confirmedSpent: candidate.confirmedSpent,
      pendingSpent: candidate.pendingSpent,
      totalSpent: candidate.totalSpent,
      confirmedRemaining: candidate.amount - candidate.confirmedSpent,
      projectedRemaining: candidate.projectedRemaining,
      spent: candidate.confirmedSpent,
    },
  };
}
