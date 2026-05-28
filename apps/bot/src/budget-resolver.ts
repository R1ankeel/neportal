import type { ApiBudget, ApiUser } from "./api";
import { budgetTotalsOrFallback } from "./api";

const SCORE_EXACT_NAME = 100;
const SCORE_NAME_PHRASE = 90;
const SCORE_TITLE_STEM = 88;
const SCORE_KEYWORD = 80;
const SCORE_WEAK_INCLUDES = 50;

const AUTO_PICK_MIN_SCORE = 80;
const AUTO_PICK_MIN_GAP = 20;
const MIN_HINT_LENGTH_FOR_INCLUDES = 4;

const SHORT_KEYWORDS = new Set(["vk", "вк"]);

export function normalizeBudgetText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMatchingKeywords(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((part) => normalizeBudgetText(part))
    .filter((kw) => kw.length > 0 && (kw.length >= 3 || SHORT_KEYWORDS.has(kw)));
}

/** Keyword как отдельный токен или фраза (без подстрочного «бумага» в «бумаги»). */
export function textContainsKeyword(normalizedText: string, keyword: string): boolean {
  const kw = normalizeBudgetText(keyword);
  if (!kw) return false;
  if (kw.length < 3 && !SHORT_KEYWORDS.has(kw)) return false;

  if (kw.includes(" ")) {
    return normalizedText.includes(kw);
  }

  const tokens = normalizedText.split(" ").filter(Boolean);
  return tokens.some((t) => t === kw);
}

function combinedSearchText(budgetHint?: string, expenseDescription?: string): string {
  return normalizeBudgetText([budgetHint, expenseDescription].filter(Boolean).join(" "));
}

function scoreExactNameMatch(budgetName: string, hint: string): number {
  const name = normalizeBudgetText(budgetName);
  const h = normalizeBudgetText(hint);
  if (!name || !h) return 0;
  if (name === h) return SCORE_EXACT_NAME;
  return 0;
}

function scoreNamePhraseMatch(budgetName: string, text: string): number {
  const name = normalizeBudgetText(budgetName);
  const normalized = normalizeBudgetText(text);
  if (!name || !normalized) return 0;

  if (normalized.includes(name)) return SCORE_NAME_PHRASE;

  const hintOnly = normalizeBudgetText(text);
  if (hintOnly.length >= MIN_HINT_LENGTH_FOR_INCLUDES) {
    if (name.includes(hintOnly)) return SCORE_NAME_PHRASE;
  }

  return 0;
}

/** Совпадение основы слова в названии бюджета (рекламу → реклама VK). */
function scoreTitleStemMatch(budgetName: string, text: string): number {
  const name = normalizeBudgetText(budgetName);
  const normalized = normalizeBudgetText(text);
  if (!name || !normalized) return 0;

  const tokens = normalized.split(" ").filter((t) => t.length >= 4);
  for (const token of tokens) {
    const stem = token.slice(0, Math.min(token.length, 6));
    if (stem.length < 4) continue;
    if (name.includes(stem)) return SCORE_TITLE_STEM;
    const nameTokens = name.split(" ").filter(Boolean);
    if (nameTokens.some((nt) => nt.startsWith(stem) || stem.startsWith(nt.slice(0, 6)))) {
      return SCORE_TITLE_STEM;
    }
  }
  return 0;
}

function scoreWeakIncludes(budgetName: string, hint: string): number {
  const name = normalizeBudgetText(budgetName);
  const h = normalizeBudgetText(hint);
  if (!name || !h || h.length < MIN_HINT_LENGTH_FOR_INCLUDES) return 0;
  if (name.includes(h) || h.includes(name)) return SCORE_WEAK_INCLUDES;
  return 0;
}

function scoreKeywordMatches(budget: ApiBudget, text: string): number {
  const keywords = parseMatchingKeywords(budget.matchingKeywords);
  if (keywords.length === 0) return 0;
  const normalized = normalizeBudgetText(text);
  if (!normalized) return 0;

  const matched = keywords.some((kw) => textContainsKeyword(normalized, kw));
  return matched ? SCORE_KEYWORD : 0;
}

function scoreBudgetForExpense(
  budget: ApiBudget,
  budgetHint?: string,
  expenseDescription?: string,
): number {
  let max = 0;
  const hint = budgetHint?.trim();
  const description = expenseDescription?.trim();
  const combined = combinedSearchText(hint, description);

  if (hint) {
    max = Math.max(max, scoreExactNameMatch(budget.title, hint));
    max = Math.max(max, scoreNamePhraseMatch(budget.title, hint));
    max = Math.max(max, scoreTitleStemMatch(budget.title, hint));
    max = Math.max(max, scoreWeakIncludes(budget.title, hint));
    max = Math.max(max, scoreKeywordMatches(budget, hint));
  }

  if (description) {
    max = Math.max(max, scoreNamePhraseMatch(budget.title, description));
    max = Math.max(max, scoreTitleStemMatch(budget.title, description));
    max = Math.max(max, scoreKeywordMatches(budget, description));
  }

  if (combined) {
    max = Math.max(max, scoreNamePhraseMatch(budget.title, combined));
    max = Math.max(max, scoreTitleStemMatch(budget.title, combined));
    max = Math.max(max, scoreKeywordMatches(budget, combined));
  }

  return max;
}

type ScoredBudget = { budget: ApiBudget; score: number };

function pickConfidentBudget(scored: ScoredBudget[]): ApiBudget | null {
  const strong = scored.filter((x) => x.score >= AUTO_PICK_MIN_SCORE).sort((a, b) => b.score - a.score);
  if (strong.length === 0) return null;
  if (strong.length === 1) return strong[0].budget;

  const top = strong[0].score;
  const second = strong[1]?.score ?? 0;
  const leaders = strong.filter((x) => x.score === top);

  if (leaders.length === 1 && top - second >= AUTO_PICK_MIN_GAP) {
    return leaders[0].budget;
  }

  return null;
}

export function filterActiveAccessibleBudgets(budgets: ApiBudget[]): ApiBudget[] {
  return budgets.filter((b) => b.status === "ACTIVE");
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
      ambiguous?: boolean;
    }
  | { kind: "none"; message: string };

export function resolveBudgetForExpense(input: BudgetResolveInput): BudgetResolveResult {
  const accessible = filterActiveAccessibleBudgets(input.budgets);

  if (accessible.length === 0) {
    return { kind: "none", message: "У вас нет доступных активных бюджетов." };
  }

  const hint = input.budgetHint?.trim();
  const description = input.expenseDescription?.trim();
  const hasTargetingText = Boolean(hint || description);

  if (!hasTargetingText) {
    return { kind: "selection", candidates: accessible };
  }

  const scored: ScoredBudget[] = accessible
    .map((b) => ({ budget: b, score: scoreBudgetForExpense(b, hint, description) }))
    .sort((a, b) => b.score - a.score);

  const confident = pickConfidentBudget(scored);
  if (confident) {
    return { kind: "resolved", budget: confident };
  }

  const strong = scored.filter((x) => x.score >= AUTO_PICK_MIN_SCORE);
  if (strong.length > 1) {
    const top = strong[0].score;
    const tied = strong.filter((x) => x.score === top).map((x) => x.budget);
    return { kind: "selection", candidates: tied, ambiguous: true };
  }

  return { kind: "selection", candidates: accessible, ambiguous: true };
}

export type BudgetCandidate = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  amount: number;
  confirmedSpent: number;
  pendingSpent: number;
  totalSpent: number;
  projectedRemaining: number;
  requiresReceipt: boolean;
  status: string;
  currency: string;
  matchingKeywords?: string | null;
};

export function apiBudgetToCandidate(budget: ApiBudget): BudgetCandidate {
  const totals = budgetTotalsOrFallback(budget);
  return {
    id: budget.id,
    name: budget.title,
    projectId: budget.project?.id ?? "",
    projectName: budget.project?.name ?? "—",
    amount: totals.amount,
    confirmedSpent: totals.confirmedSpent,
    pendingSpent: totals.pendingSpent,
    totalSpent: totals.totalSpent,
    projectedRemaining: totals.projectedRemaining,
    requiresReceipt: budget.requiresReceipt,
    status: budget.status,
    currency: budget.currency,
    matchingKeywords: budget.matchingKeywords ?? null,
  };
}

export function candidateToApiBudget(
  candidate: BudgetCandidate,
  project?: { id: string; name: string } | null,
  matchingKeywords?: string | null,
): ApiBudget {
  return {
    id: candidate.id,
    title: candidate.name,
    initialAmount: candidate.amount,
    spentAmount: candidate.confirmedSpent,
    currency: candidate.currency,
    status: candidate.status,
    requiresReceipt: candidate.requiresReceipt,
    matchingKeywords: matchingKeywords ?? null,
    project:
      project ??
      (candidate.projectId
        ? { id: candidate.projectId, name: candidate.projectName }
        : candidate.projectName !== "—"
          ? { id: "", name: candidate.projectName }
          : null),
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
