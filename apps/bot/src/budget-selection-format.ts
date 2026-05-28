import { formatMoney } from "./api";
import type { BudgetCandidate } from "./budget-resolver";

const TELEGRAM_INLINE_LABEL_MAX = 64;

function receiptLabel(requiresReceipt: boolean): string {
  return requiresReceipt ? "Чек обязателен" : "Чек не обязателен";
}

export function budgetCandidatesSpanMultipleProjects(candidates: BudgetCandidate[]): boolean {
  const projectIds = new Set(
    candidates.map((c) => c.projectId).filter((id) => id.trim().length > 0),
  );
  return projectIds.size > 1;
}

export function truncateTelegramInlineLabel(text: string, max = TELEGRAM_INLINE_LABEL_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function formatBudgetCandidateLabel(
  candidate: BudgetCandidate,
  showProject: boolean,
): string {
  const projectName = candidate.projectName?.trim();
  const withProject =
    showProject && projectName && projectName !== "—"
      ? `${candidate.name} (${projectName})`
      : candidate.name;
  return truncateTelegramInlineLabel(withProject);
}

export function formatBudgetSelectionMessage(
  candidates: BudgetCandidate[],
  options?: { ambiguous?: boolean; fromConfirmation?: boolean },
): string {
  const showProject = budgetCandidatesSpanMultipleProjects(candidates);
  const lines: string[] = [];

  if (options?.fromConfirmation) {
    lines.push("К какому бюджету отнести расход?");
  } else if (options?.ambiguous) {
    lines.push("Не смог однозначно определить бюджет. Выберите бюджет из списка:");
  } else {
    lines.push("К какому бюджету отнести расход?");
  }

  lines.push("");

  candidates.forEach((c, index) => {
    const title = showProject ? formatBudgetCandidateLabel(c, true) : c.name;
    lines.push(`${index + 1}. ${title}`);
    if (!showProject) {
      lines.push(`   Проект: ${c.projectName}`);
    }
    lines.push(
      `   Остаток с учётом ожидания: ${formatMoney(c.projectedRemaining, c.currency)}`,
    );
    lines.push(`   ${receiptLabel(c.requiresReceipt)}`);
    if (index < candidates.length - 1) lines.push("");
  });

  lines.push("", "Выберите кнопкой ниже или отправьте номер бюджета. Для отмены напишите «отмена».");
  return lines.join("\n");
}
