import type { ApiBudget, ApiUser } from "./api";
import { budgetTotalsOrFallback } from "./api";

/** Минимальный score для участия в сопоставлении */
const MIN_MATCH_SCORE = 50;
/** Score, при котором один лидер считается уверенным (если нет равного второго) */
const CONFIDENT_SCORE = 70;

const SCORE_EXACT = 100;
const SCORE_HINT_CATEGORY = 90;
const SCORE_DESC_CATEGORY = 80;
const SCORE_INCLUDES = 70;
const SCORE_FUZZY = 50;

const BUDGET_STOP_WORDS = new Set([
  "закупка",
  "покупка",
  "бюджет",
  "расходы",
  "расход",
  "траты",
  "оплата",
  "на",
  "для",
  "по",
]);

const RUSSIAN_ENDINGS = [
  "ия",
  "ии",
  "ию",
  "ией",
  "ей",
  "ов",
  "ев",
  "ый",
  "ая",
  "ую",
  "ом",
  "ем",
  "ами",
  "ями",
  "ах",
  "ях",
  "а",
  "я",
  "и",
  "ы",
  "е",
  "у",
  "ю",
];

export type BudgetCategory = "stationery" | "vk_ads";

/** Падежные и разговорные формы → базовая лексема (MVP) */
const WORD_ALIASES: Record<string, string> = {
  канцелярии: "канцелярия",
  канцелярию: "канцелярия",
  канцелярку: "канцелярия",
  канцелярке: "канцелярия",
  канцтоваров: "канцтовары",
  канцтовара: "канцтовары",
  рекламу: "реклама",
  ручек: "ручки",
  ручкой: "ручки",
  ручку: "ручка",
  карандашей: "карандаши",
  карандаша: "карандаш",
  карандашем: "карандаш",
  бумагу: "бумага",
  бумаги: "бумага",
  тетрадью: "тетради",
  тетрадей: "тетради",
  папку: "папки",
  папок: "папки",
};

const CATEGORY_ALIASES: Record<BudgetCategory, string[]> = {
  stationery: [
    "канцелярия",
    "канцелярии",
    "канцелярию",
    "канцелярские товары",
    "канцтовары",
    "канцтоваров",
    "канцелярка",
    "канцелярку",
    "ручки",
    "ручка",
    "ручек",
    "карандаши",
    "карандаш",
    "карандашей",
    "бумага",
    "бумагу",
    "бумаги",
    "тетради",
    "тетрадь",
    "скрепки",
    "файлы",
    "папки",
  ],
  vk_ads: [
    "реклама vk",
    "реклама вк",
    "рекламу vk",
    "рекламу вк",
    "вк",
    "vk",
    "рекламный кабинет",
    "таргет",
    "таргетинг",
    "объявления",
    "продвижение",
  ],
};

export function normalizeBudgetText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalToken(token: string): string {
  const normalized = normalizeBudgetText(token);
  if (!normalized) return "";
  return WORD_ALIASES[normalized] ?? normalized;
}

export function tokenizeBudgetText(text: string, stripStopWords = true): string[] {
  const normalized = normalizeBudgetText(text);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map(canonicalToken)
    .filter((t) => t.length > 0 && (!stripStopWords || !BUDGET_STOP_WORDS.has(t)));
}

export function russianStem(word: string): string {
  let w = canonicalToken(word);
  if (w.length < 4) return w;
  const sorted = [...RUSSIAN_ENDINGS].sort((a, b) => b.length - a.length);
  for (const ending of sorted) {
    if (w.endsWith(ending) && w.length - ending.length >= 3) {
      return w.slice(0, -ending.length);
    }
  }
  return w;
}

export function isSimilarRussianWord(a: string, b: string): boolean {
  const na = canonicalToken(a);
  const nb = canonicalToken(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const sa = russianStem(na);
  const sb = russianStem(nb);
  if (sa === sb) return true;
  if (sa.length >= 4 && sb.length >= 4 && (sa.startsWith(sb) || sb.startsWith(sa))) return true;
  if (na.startsWith(nb) || nb.startsWith(na)) return true;
  return false;
}

function stripStopWordsFromText(text: string): string {
  return tokenizeBudgetText(text, true).join(" ");
}

function detectCategoriesInText(text: string): Set<BudgetCategory> {
  const normalized = normalizeBudgetText(text);
  const categories = new Set<BudgetCategory>();
  if (!normalized) return categories;

  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES) as [BudgetCategory, string[]][]) {
    for (const alias of aliases) {
      const aliasNorm = normalizeBudgetText(alias);
      if (!aliasNorm) continue;
      if (aliasNorm.includes(" ")) {
        if (normalized.includes(aliasNorm)) {
          categories.add(category);
        }
        continue;
      }
      const tokens = normalized.split(" ");
      if (tokens.some((t) => t === aliasNorm || isSimilarRussianWord(t, aliasNorm))) {
        categories.add(category);
      }
      if (normalized.includes(aliasNorm) && aliasNorm.length >= 3) {
        categories.add(category);
      }
    }
  }

  if (normalized.includes("канцеляр")) {
    categories.add("stationery");
  }
  if (
    /\b(vk|вк)\b/.test(normalized) ||
    (normalized.includes("реклам") && (normalized.includes("vk") || normalized.includes("вк"))) ||
    normalized.includes("таргет")
  ) {
    categories.add("vk_ads");
  }

  return categories;
}

function detectBudgetCategories(budgetTitle: string): Set<BudgetCategory> {
  const fromText = detectCategoriesInText(budgetTitle);
  const normalized = normalizeBudgetText(budgetTitle);
  if (normalized.includes("канцеляр")) {
    fromText.add("stationery");
  }
  if (
    (normalized.includes("реклам") && (/\bvk\b/.test(normalized) || /\bвк\b/.test(normalized))) ||
    /\bреклама\s+(vk|вк)\b/.test(normalized)
  ) {
    fromText.add("vk_ads");
  }
  return fromText;
}

function categoriesOverlap(a: Set<BudgetCategory>, b: Set<BudgetCategory>): boolean {
  for (const c of a) {
    if (b.has(c)) return true;
  }
  return false;
}

function scoreExactMatch(budgetTitle: string, hint: string): number {
  const titleCore = stripStopWordsFromText(budgetTitle);
  const hintCore = stripStopWordsFromText(hint);
  if (!titleCore || !hintCore) return 0;
  if (titleCore === hintCore) return SCORE_EXACT;
  const titleNorm = normalizeBudgetText(budgetTitle);
  const hintNorm = normalizeBudgetText(hint);
  if (titleNorm === hintNorm) return SCORE_EXACT;
  return 0;
}

function scoreIncludesMatch(budgetTitle: string, text: string): number {
  const titleCore = stripStopWordsFromText(budgetTitle);
  const textCore = stripStopWordsFromText(text);
  const titleNorm = normalizeBudgetText(budgetTitle);
  const textNorm = normalizeBudgetText(text);
  if (!titleCore || !textCore) return 0;

  if (titleCore.includes(textCore) || textCore.includes(titleCore)) return SCORE_INCLUDES;
  if (titleNorm.includes(textNorm) || textNorm.includes(titleNorm)) return SCORE_INCLUDES;

  const titleTokens = tokenizeBudgetText(budgetTitle);
  const textTokens = tokenizeBudgetText(text);
  if (textTokens.length === 0) return 0;

  const allInTitle = textTokens.every((t) =>
    titleTokens.some((tw) => tw.includes(t) || t.includes(tw) || isSimilarRussianWord(tw, t)),
  );
  if (allInTitle) return SCORE_INCLUDES;

  const allInText =
    titleTokens.length > 0 &&
    titleTokens.every((t) =>
      textTokens.some((tw) => tw.includes(t) || t.includes(tw) || isSimilarRussianWord(tw, t)),
    );
  if (allInText) return SCORE_INCLUDES;

  return 0;
}

function scoreFuzzyTokenMatch(budgetTitle: string, text: string): number {
  const titleTokens = tokenizeBudgetText(budgetTitle);
  const textTokens = tokenizeBudgetText(text);
  if (titleTokens.length === 0 || textTokens.length === 0) return 0;

  const matched = textTokens.filter((t) =>
    titleTokens.some((tw) => isSimilarRussianWord(tw, t)),
  ).length;
  if (matched === 0) return 0;

  const minLen = Math.min(textTokens.length, titleTokens.length);
  if (matched >= minLen) return SCORE_FUZZY;
  if (matched >= 1 && textTokens.length === 1) return SCORE_FUZZY;
  return 0;
}

function scoreCategoryMatch(
  budgetTitle: string,
  text: string,
  forHint: boolean,
): number {
  const budgetCats = detectBudgetCategories(budgetTitle);
  const textCats = detectCategoriesInText(text);
  if (budgetCats.size === 0 || textCats.size === 0) return 0;
  if (!categoriesOverlap(budgetCats, textCats)) return 0;
  return forHint ? SCORE_HINT_CATEGORY : SCORE_DESC_CATEGORY;
}

function scoreBudgetAgainstText(
  budgetTitle: string,
  text: string,
  options: { isHint: boolean },
): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  let max = 0;
  max = Math.max(max, scoreExactMatch(budgetTitle, trimmed));
  max = Math.max(max, scoreCategoryMatch(budgetTitle, trimmed, options.isHint));
  max = Math.max(max, scoreIncludesMatch(budgetTitle, trimmed));
  max = Math.max(max, scoreFuzzyTokenMatch(budgetTitle, trimmed));

  if (!options.isHint) {
    const catOnly = scoreCategoryMatch(budgetTitle, trimmed, false);
    max = Math.max(max, catOnly);
  }

  return max;
}

function scoreBudgetForExpense(
  budget: ApiBudget,
  budgetHint?: string,
  expenseDescription?: string,
): number {
  let max = 0;
  const hint = budgetHint?.trim();
  const description = expenseDescription?.trim();

  if (hint) {
    max = Math.max(max, scoreBudgetAgainstText(budget.title, hint, { isHint: true }));
  }
  if (description) {
    max = Math.max(max, scoreBudgetAgainstText(budget.title, description, { isHint: false }));
  }

  if (hint && description) {
    const combined = `${hint} ${description}`;
    max = Math.max(max, scoreCategoryMatch(budget.title, combined, true));
    max = Math.max(max, scoreCategoryMatch(budget.title, combined, false));
  }

  return max;
}

type ScoredBudget = { budget: ApiBudget; score: number };

function pickBestBudget(
  budgets: ApiBudget[],
  scoreFn: (budget: ApiBudget) => number,
): { kind: "one"; budget: ApiBudget } | { kind: "many"; budgets: ApiBudget[] } | { kind: "none" } {
  const scored: ScoredBudget[] = budgets
    .map((b) => ({ budget: b, score: scoreFn(b) }))
    .filter((x) => x.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { kind: "none" };

  if (scored.length === 1) {
    return { kind: "one", budget: scored[0].budget };
  }

  const topScore = scored[0].score;
  const tiedTop = scored.filter((x) => x.score === topScore);

  if (tiedTop.length === 1) {
    const secondScore = scored[1]?.score ?? 0;
    if (topScore >= CONFIDENT_SCORE || topScore - secondScore >= 10) {
      return { kind: "one", budget: tiedTop[0].budget };
    }
  }

  if (tiedTop.length === 1 && topScore >= SCORE_HINT_CATEGORY) {
    return { kind: "one", budget: tiedTop[0].budget };
  }

  if (tiedTop.length > 1) {
    return { kind: "many", budgets: tiedTop.map((x) => x.budget) };
  }

  return { kind: "one", budget: scored[0].budget };
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
      /** Подсказка не сопоставилась ни с одним бюджетом (нет category/token match) */
      notFoundHint?: string;
      /** Несколько бюджетов с одинаково высоким score */
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

  if (hasTargetingText) {
    const picked = pickBestBudget(accessible, (b) =>
      scoreBudgetForExpense(b, hint, description),
    );

    if (picked.kind === "one") {
      return { kind: "resolved", budget: picked.budget };
    }

    if (picked.kind === "many") {
      return {
        kind: "selection",
        candidates: picked.budgets,
        ambiguous: true,
      };
    }

    if (hint) {
      return {
        kind: "selection",
        candidates: accessible,
        notFoundHint: hint,
      };
    }

    return {
      kind: "selection",
      candidates: accessible,
      ambiguous: true,
    };
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

export function candidateToApiBudget(
  candidate: BudgetCandidate,
  project?: { id: string; name: string } | null,
): ApiBudget {
  return {
    id: candidate.id,
    title: candidate.name,
    initialAmount: candidate.amount,
    spentAmount: candidate.confirmedSpent,
    currency: candidate.currency,
    status: candidate.status,
    requiresReceipt: candidate.requiresReceipt,
    project:
      project ?? (candidate.projectName !== "—" ? { id: "", name: candidate.projectName } : null),
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
