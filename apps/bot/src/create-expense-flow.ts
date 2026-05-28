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
import { resolveProjectFromHint } from "./hint-matchers";
import type { ResolvedCreateExpense } from "./intent-resolver";
import { replyWithIntentPreview } from "./intent-preview";
import { setPendingConfirmation } from "./pending-intent";
import { startPendingBudgetSelection } from "./pending-budget-selection";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";
import {
  resolveProjectForAction,
  resolveProjectForActionMessage,
} from "./project-resolution";
import { startProjectSelectionIfNeeded } from "./project-selection-flow";
import type { ProjectSelectionContinue } from "./pending-project-selection";

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
      project?: ApiProject;
      candidates: BudgetCandidate[];
      ambiguous?: boolean;
    }
  | { kind: "project_selection" }
  | { kind: "error"; message: string };

async function fetchAllAccessibleBudgets(
  projects: ApiProject[],
  actorUserId: string,
  userId: string,
): Promise<ApiBudget[]> {
  const all: ApiBudget[] = [];
  for (const project of projects) {
    const budgets = await fetchBudgets(project.id, actorUserId, userId);
    for (const budget of budgets) {
      all.push({
        ...budget,
        project: budget.project ?? { id: project.id, name: project.name },
      });
    }
  }
  return all;
}

function projectFromBudget(budget: ApiBudget): ApiProject | null {
  if (budget.project?.id) {
    return {
      id: budget.project.id,
      name: budget.project.name,
    };
  }
  return null;
}

function buildResolvedExpense(
  project: ApiProject,
  budget: ApiBudget,
  userId: string,
  amount: number,
  description?: string,
): ResolvedCreateExpense {
  return {
    intent: "create_expense",
    project,
    budget,
    userId,
    amount,
    description,
  };
}

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
  const projectList = projects ?? (await fetchProjects(currentUser.id));
  const userId = currentUser.id;
  const projectHintTrimmed = params.projectHint?.trim();
  const hasBudgetTargeting = Boolean(params.budgetHint?.trim() || params.description?.trim());

  if (projectHintTrimmed) {
    const projectResult = resolveProjectFromHint(projectList, projectHintTrimmed);
    if (projectResult.kind === "not_found" || projectResult.kind === "ambiguous") {
      return { kind: "error", message: projectResult.message };
    }
    const project = projectResult.project;
    const budgets = await fetchBudgets(project.id, currentUser.id, userId);
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
      resolved: buildResolvedExpense(
        project,
        budgetResult.budget,
        userId,
        params.amount,
        params.description,
      ),
    };
  }

  if (hasBudgetTargeting) {
    const allBudgets = await fetchAllAccessibleBudgets(projectList, currentUser.id, userId);
    const budgetResult = resolveBudgetForExpense({
      budgets: allBudgets,
      budgetHint: params.budgetHint,
      expenseDescription: params.description,
      currentUser,
    });

    if (budgetResult.kind === "resolved") {
      const project =
        projectFromBudget(budgetResult.budget);
      if (!project) {
        return {
          kind: "error",
          message: "Не удалось определить проект для выбранного бюджета.",
        };
      }
      return {
        kind: "resolved",
        project,
        resolved: buildResolvedExpense(
          project,
          budgetResult.budget,
          userId,
          params.amount,
          params.description,
        ),
      };
    }

    if (budgetResult.kind === "selection") {
      const firstBudget = budgetResult.candidates[0];
      const project = firstBudget
        ? projectFromBudget(firstBudget) ?? undefined
        : undefined;
      return {
        kind: "selection",
        project: project ?? undefined,
        candidates: budgetResult.candidates.map(apiBudgetToCandidate),
        ambiguous: budgetResult.ambiguous,
      };
    }
  }

  const projectAction = resolveProjectForAction(projectList);
  if (projectAction.kind === "selection_required") {
    return { kind: "project_selection" };
  }
  const projectError = resolveProjectForActionMessage(projectAction);
  if (projectError) {
    return { kind: "error", message: projectError };
  }

  if (projectAction.kind !== "resolved") {
    return { kind: "error", message: "Не удалось выбрать проект." };
  }
  const project = projectAction.project;
  const budgets = await fetchBudgets(project.id, currentUser.id, userId);
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
    resolved: buildResolvedExpense(
      project,
      budgetResult.budget,
      userId,
      params.amount,
      params.description,
    ),
  };
}

function expenseProjectContinuation(
  params: {
    amount: number;
    description?: string;
    budgetHint?: string;
    executeIfResolved?: boolean;
  },
  fromAi: boolean,
): ProjectSelectionContinue {
  if (fromAi || !params.executeIfResolved) {
    return {
      kind: "ai_intent",
      intent: {
        intent: "create_expense",
        confidence: 1,
        requiresConfirmation: true,
        payload: {
          amount: params.amount,
          description: params.description,
          budgetHint: params.budgetHint,
        },
      },
    };
  }
  return {
    kind: "slash_expense",
    amount: params.amount,
    description: params.description,
    budgetHint: params.budgetHint,
    executeIfResolved: true,
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
    /** true when invoked from AI intent routing */
    fromAiIntent?: boolean;
  },
): Promise<CreateExpenseFlowResult> {
  const projectList = await fetchProjects(currentUser.id);
  let resolvedParams = params;

  if (!params.projectHint?.trim()) {
    const precheck = resolveProjectForAction(projectList);
    if (precheck.kind === "selection_required") {
      const hasBudgetTargeting = Boolean(params.budgetHint?.trim() || params.description?.trim());
      if (!hasBudgetTargeting) {
        const project = await startProjectSelectionIfNeeded(
          ctx,
          telegramUserId,
          projectList,
          undefined,
          expenseProjectContinuation(params, params.fromAiIntent ?? false),
        );
        if (!project) {
          return { kind: "selection_started" };
        }
        resolvedParams = { ...params, projectHint: project.name };
      }
    }
  }

  const result = await resolveCreateExpense(currentUser, resolvedParams, projectList);

  if (result.kind === "project_selection") {
    const project = await startProjectSelectionIfNeeded(
      ctx,
      telegramUserId,
      projectList,
      undefined,
      expenseProjectContinuation(params, params.fromAiIntent ?? false),
    );
    if (!project) {
      return { kind: "selection_started" };
    }
    return beginCreateExpenseFlow(ctx, telegramUserId, currentUser, {
      ...params,
      projectHint: project.name,
      fromAiIntent: params.fromAiIntent,
    });
  }

  if (result.kind === "error") {
    return { kind: "error", message: result.message };
  }

  if (result.kind === "selection") {
    const project = result.project;
    startPendingBudgetSelection(telegramUserId, {
      candidates: result.candidates,
      payload: {
        amount: params.amount,
        description: params.description,
        projectId: project?.id ?? result.candidates[0]?.projectId ?? "",
        projectName: project?.name ?? result.candidates[0]?.projectName ?? "",
        userId: currentUser.id,
        budgetHint: params.budgetHint,
        source: "TELEGRAM_TEXT",
      },
    });
    await replyWithActiveChoiceKeyboard(
      ctx,
      telegramUserId,
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
    params.projectHint ?? result.project.name,
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
  const resolvedProject: ApiProject = {
    id: selected.projectId || project.id || payload.projectId,
    name: selected.projectName || project.name || payload.projectName,
  };

  const budget: ApiBudget = {
    id: selected.id,
    title: selected.name,
    initialAmount: selected.amount,
    spentAmount: selected.confirmedSpent,
    currency: selected.currency,
    status: selected.status,
    requiresReceipt: selected.requiresReceipt,
    matchingKeywords: selected.matchingKeywords ?? null,
    project: resolvedProject,
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
    project: resolvedProject,
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
    resolvedProject.name,
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
    fromAiIntent: true,
  });

  if (flow.kind === "error") {
    await ctx.reply(flow.message);
  }
}
