import { formatMoney } from "./api";
import type { BudgetCandidate } from "./budget-resolver";

function receiptLabel(requiresReceipt: boolean): string {
  return requiresReceipt ? "Чек обязателен" : "Чек не обязателен";
}

export function formatBudgetSelectionMessage(
  candidates: BudgetCandidate[],
  options?: { ambiguous?: boolean; fromConfirmation?: boolean },
): string {
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
    lines.push(`${index + 1}. ${c.name}`);
    lines.push(`   Проект: ${c.projectName}`);
    lines.push(
      `   Остаток с учётом ожидания: ${formatMoney(c.projectedRemaining, c.currency)}`,
    );
    lines.push(`   ${receiptLabel(c.requiresReceipt)}`);
    if (index < candidates.length - 1) lines.push("");
  });

  lines.push("", "Выберите кнопкой ниже или отправьте номер бюджета. Для отмены напишите «отмена».");
  return lines.join("\n");
}
