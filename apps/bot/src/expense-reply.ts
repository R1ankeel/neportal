import { budgetRemaining, formatMoney, type ApiBudget } from "./api";

export function formatExpenseCreatedReply(
  budget: ApiBudget,
  amount: number,
  options: { requiresReceipt: boolean; pendingReceipt: boolean },
): string {
  const remaining = budgetRemaining(budget);

  if (options.pendingReceipt) {
    return [
      `Расход добавлен как неподтверждённый. По бюджету «${budget.title}» обязателен чек. Отправьте фото или документ чека.`,
      `Сумма: ${formatMoney(amount, budget.currency)}`,
      `Остаток (с учётом ожидания): ${formatMoney(remaining, budget.currency)}`,
    ].join("\n");
  }

  const lines = [
    `Расход создан в бюджете «${budget.title}»: ${formatMoney(amount, budget.currency)}`,
    `Остаток бюджета: ${formatMoney(remaining, budget.currency)}`,
  ];

  if (!options.requiresReceipt) {
    lines.push("", "Отправьте фото или документ чека, чтобы прикрепить его к этому расходу.");
  }

  return lines.join("\n");
}
