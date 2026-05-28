import type { ApiBudget, ApiUser } from "./api";
import { devLog } from "./dev-log";
import { resolveBudgetForExpense, type BudgetResolveInput } from "./budget-resolver";

const DEV_USER: ApiUser = { id: "dev-u1", fullName: "Dev", role: "OWNER" };

function mockBudget(
  id: string,
  title: string,
  project: { id: string; name: string },
  opts?: { matchingKeywords?: string | null },
): ApiBudget {
  return {
    id,
    title,
    initialAmount: 1000,
    spentAmount: 0,
    currency: "RUB",
    status: "ACTIVE",
    requiresReceipt: false,
    matchingKeywords: opts?.matchingKeywords ?? null,
    project,
  };
}

function runCase(
  id: string,
  input: Omit<BudgetResolveInput, "currentUser">,
  expect: {
    kind: "resolved" | "selection" | "none";
    budgetId?: string;
    candidateCount?: number;
    minCandidates?: number;
    ambiguous?: boolean;
  },
): boolean {
  const result = resolveBudgetForExpense({ ...input, currentUser: DEV_USER });
  let ok = result.kind === expect.kind;

  if (expect.kind === "resolved" && result.kind === "resolved") {
    ok = ok && (!expect.budgetId || result.budget.id === expect.budgetId);
  }

  if (expect.kind === "selection" && result.kind === "selection") {
    if (expect.candidateCount !== undefined) {
      ok = ok && result.candidates.length === expect.candidateCount;
    }
    if (expect.minCandidates !== undefined) {
      ok = ok && result.candidates.length >= expect.minCandidates;
    }
    if (expect.ambiguous !== undefined) {
      ok = ok && result.ambiguous === expect.ambiguous;
    }
  }

  devLog(`budget-resolver ${id} ${ok ? "OK" : "FAIL"}`, {
    expected: expect,
    got:
      result.kind === "resolved"
        ? { kind: result.kind, budgetId: result.budget.id, title: result.budget.title }
        : result.kind === "selection"
          ? {
              kind: result.kind,
              count: result.candidates.length,
              ambiguous: result.ambiguous,
              titles: result.candidates.map((c) => c.title),
            }
          : result,
  });
  return ok;
}

export function devLogBudgetResolverChecks(): void {
  const p1 = { id: "p1", name: "Project A" };
  const p2 = { id: "p2", name: "Project B" };

  const noise: ApiBudget[] = [
    mockBudget("n1", "Audit Beta Budget", p1),
    mockBudget("n2", "Budget-smoke legacy", p1),
    mockBudget("n3", "Smoke budget B", p2),
  ];
  const unique = mockBudget("u1", "AUDIT-UNIQUE-BUDGET-9281", p1);

  // S1: exact unique title among noise
  runCase(
    "S1",
    { budgets: [...noise, unique], budgetHint: "AUDIT-UNIQUE-BUDGET-9281" },
    { kind: "resolved", budgetId: "u1" },
  );

  // S2: exact unique keyword, different title
  runCase(
    "S2",
    {
      budgets: [
        mockBudget("k1", "Display Name Alpha", p1, {
          matchingKeywords: "AUDIT-KW-UNIQUE-42",
        }),
        ...noise,
      ],
      budgetHint: "AUDIT-KW-UNIQUE-42",
    },
    { kind: "resolved", budgetId: "k1" },
  );

  // S3: same title in two projects
  runCase(
    "S3",
    {
      budgets: [
        mockBudget("s3a", "Shared Name", p1),
        mockBudget("s3b", "Shared Name", p2),
      ],
      budgetHint: "Shared Name",
    },
    { kind: "selection", candidateCount: 2, ambiguous: true },
  );

  // S4: no hint, single budget → selection (not autoresolve)
  runCase("S4", { budgets: [mockBudget("only", "Solo Budget", p1)] }, { kind: "selection", candidateCount: 1 });

  // S6: project-scoped list + exact hint (simulates projectHint path)
  runCase(
    "S6",
    {
      budgets: [mockBudget("s6", "Beta Line Item", p1), mockBudget("s6b", "Other", p1)],
      budgetHint: "Beta Line Item",
    },
    { kind: "resolved", budgetId: "s6" },
  );

  // S7: description-only fuzzy (regression)
  runCase(
    "S7",
    {
      budgets: [
        mockBudget("s7a", "На подарки", p1),
        mockBudget("s7b", "Реклама VK", p1),
      ],
      expenseDescription: "рекламу",
    },
    { kind: "resolved", budgetId: "s7b" },
  );

  // S8: fuzzy tie — two phrase matches, no exact pre-check
  runCase(
    "S8",
    {
      budgets: [
        mockBudget("s8a", "Alpha Marketing", p1),
        mockBudget("s8b", "Beta Marketing", p1),
      ],
      budgetHint: "marketing",
    },
    { kind: "selection", minCandidates: 2, ambiguous: true },
  );

  devLog("budget-resolver dev checks done (S5/S9: harness + resolveCreateExpense)");
}
