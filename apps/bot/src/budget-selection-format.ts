import { formatMoney } from "./api";
import type { BudgetCandidate } from "./budget-resolver";

function receiptLabel(requiresReceipt: boolean): string {
  return requiresReceipt ? "Чек обязателен" : "Чек не обязателен";
}

export function formatBudgetSelectionMessage(
  candidates: BudgetCandidate[],
  options?: { notFoundHint?: string },
): string {
  const lines: string[] = [];

  if (options?.notFoundHint) {
    lines.push(`Не нашёл бюджет «${options.notFoundHint}». Выберите бюджет из списка:`);
  } else {
    lines.push("К какому бюджету отнести расход?");
  }

  lines.push("");

  candidates.forEach((c, index) => {
    lines.push(`${index + 1}. ${c.name}`);
    lines.push(`   Проект: ${c.projectName}`);
    lines.push(
      `   Остаток с учётом ожидания: ${formatMoney(c.projectedRemaining, c.currency)}`,
    );
    lines.push(`   ${receiptLabel(c.requiresReceipt)}`);
    if (index < candidates.length - 1) lines.push("");
  });

  lines.push("", "Напишите номер бюджета.");
  return lines.join("\n");
}
