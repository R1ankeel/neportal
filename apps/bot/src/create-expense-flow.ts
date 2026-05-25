import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { CreateExpensePayload } from "@neportal/ai-contracts";
import {
  apiBudgetToCandidate,
  type BudgetCandidate,
  resolveBudgetForExpense,
} from "./budget-resolver";
import { formatBudgetSelectionMessage } from "./budget-selection-format";
import type { ApiBudget, ApiProject, ApiUser } from "./api";
import { fetchBudgets, fetchProjects } from "./api";
import { findProjectByHint } from "./hint-matchers";
import type { ResolvedCreateExpense } from "./intent-resolver";
import { replyWithIntentPreview } from "./intent-preview";
import { setPendingConfirmation } from "./pending-intent";
import { startPendingBudgetSelection } from "./pending-budget-selection";

export type ExpenseSelectionPayload = {
  amount: number;
  description?: string;
  projectId: string;
  projectName: string;
  userId: string;
  budgetHint?: string;
  previousBudgetId?: string;
  source: "TELEGRAM_TEXT" | "TELEGRAM_VOICE";
};

export type CreateExpenseFlowResult =
  | { kind: "selection_started" }
  | { kind: "confirmation"; intent: AiIntent; resolved: ResolvedCreateExpense }
  | { kind: "executed" }
  | { kind: "error"; message: string };

function buildCreateExpenseIntent(
  payload: CreateExpensePayload,
  projectHint?: string,
): AiIntent {
  return {
    intent: "create_expense",
    confidence: 1,
    requiresConfirmation: true,
    payload: {
      amount: payload.amount,
      description: payload.description,
      budgetHint: payload.budgetHint,
      projectHint,
    },
  };
}

export type ResolveCreateExpenseResult =
  | { kind: "resolved"; project: ApiProject; resolved: ResolvedCreateExpense }
  | {
      kind: "selection";
      project: ApiProject;
      candidates: BudgetCandidate[];
      ambiguous?: boolean;
    }
  | { kind: "error"; message: string };

export async function resolveCreateExpense(
  currentUser: ApiUser,
  params: {
    amount: number;
    description?: string;
    projectHint?: string;
    budgetHint?: string;
  },
  projects?: ApiProject[],
): Promise<ResolveCreateExpenseResult> {
  const projectList = projects ?? (await fetchProjects());
  const project = findProjectByHint(projectList, params.projectHint);
  if (!project) {
    return { kind: "error", message: "Нет проектов. Сначала создайте проект в Web." };
  }

  const budgets = await fetchBudgets(project.id, currentUser.id);
  const budgetResult = resolveBudgetForExpense({
    budgets,
    budgetHint: params.budgetHint,
    expenseDescription: params.description,
    currentUser,
  });

  if (budgetResult.kind === "none") {
    return { kind: "error", message: budgetResult.message };
  }

  if (budgetResult.kind === "selection") {
    return {
      kind: "selection",
      project,
      candidates: budgetResult.candidates.map(apiBudgetToCandidate),
      ambiguous: budgetResult.ambiguous,
    };
  }

  return {
    kind: "resolved",
    project,
    resolved: {
      intent: "create_expense",
      project,
      budget: budgetResult.budget,
      userId: currentUser.id,
      amount: params.amount,
      description: params.description,
    },
  };
}

export async function beginCreateExpenseFlow(
  ctx: Context,
  telegramUserId: number,
  currentUser: ApiUser,
  params: {
    amount: number;
    description?: string;
    projectHint?: string;
    budgetHint?: string;
    /** При однозначном бюджете — сразу создать расход (slash /expense) */
    executeIfResolved?: boolean;
  },
): Promise<CreateExpenseFlowResult> {
  const result = await resolveCreateExpense(currentUser, params);

  if (result.kind === "error") {
    return { kind: "error", message: result.message };
  }

  if (result.kind === "selection") {
    startPendingBudgetSelection(telegramUserId, {
      candidates: result.candidates,
      payload: {
        amount: params.amount,
        description: params.description,
        projectId: result.project.id,
        projectName: result.project.name,
        userId: currentUser.id,
        budgetHint: params.budgetHint,
        source: "TELEGRAM_TEXT",
      },
    });
    await ctx.reply(
      formatBudgetSelectionMessage(result.candidates, {
        ambiguous: result.ambiguous,
      }),
    );
    return { kind: "selection_started" };
  }

  if (params.executeIfResolved) {
    const { executeResolvedIntent } = await import("./intent-executor");
    const reply = await executeResolvedIntent(result.resolved, telegramUserId, ctx.api);
    await ctx.reply(reply);
    return { kind: "executed" };
  }

  const intent = buildCreateExpenseIntent(
    {
      amount: params.amount,
      description: params.description,
      budgetHint: params.budgetHint ?? result.resolved.budget.title,
    },
    params.projectHint,
  );

  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent,
    resolved: result.resolved,
  });
  await replyWithIntentPreview(ctx, telegramUserId, result.resolved);
  return { kind: "confirmation", intent, resolved: result.resolved };
}

export function confirmCreateExpenseAfterBudgetSelection(
  telegramUserId: number,
  project: ApiProject,
  payload: ExpenseSelectionPayload,
  selected: BudgetCandidate,
): ResolvedCreateExpense {
  const budget: ApiBudget = {
    id: selected.id,
    title: selected.name,
    initialAmount: selected.amount,
    spentAmount: selected.confirmedSpent,
    currency: selected.currency,
    status: selected.status,
    requiresReceipt: selected.requiresReceipt,
    matchingKeywords: selected.matchingKeywords ?? null,
    project,
    totals: {
      amount: selected.amount,
      confirmedSpent: selected.confirmedSpent,
      pendingSpent: selected.pendingSpent,
      totalSpent: selected.totalSpent,
      confirmedRemaining: selected.amount - selected.confirmedSpent,
      projectedRemaining: selected.projectedRemaining,
      spent: selected.confirmedSpent,
    },
  };

  const resolved: ResolvedCreateExpense = {
    intent: "create_expense",
    project,
    budget,
    userId: payload.userId,
    amount: payload.amount,
    description: payload.description,
  };

  const intent = buildCreateExpenseIntent(
    {
      amount: payload.amount,
      description: payload.description,
      budgetHint: selected.name,
    },
    undefined,
  );

  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent,
    resolved,
  });

  return resolved;
}

export async function beginCreateExpenseFromAiIntent(
  ctx: Context,
  telegramUserId: number,
  currentUser: ApiUser,
  intent: Extract<AiIntent, { intent: "create_expense" }>,
): Promise<void> {
  const flow = await beginCreateExpenseFlow(ctx, telegramUserId, currentUser, {
    amount: intent.payload.amount,
    description: intent.payload.description,
    projectHint: intent.payload.projectHint,
    budgetHint: intent.payload.budgetHint,
    executeIfResolved: false,
  });

  if (flow.kind === "error") {
    await ctx.reply(flow.message);
  }
}
