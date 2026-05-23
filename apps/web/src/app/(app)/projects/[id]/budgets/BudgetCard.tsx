import Link from "next/link";
import {
  budgetStatusLabel,
  budgetTotalsOrFallback,
  formatMoney,
  requiresReceiptLabel,
} from "@/lib/format";
import type { ApiBudget } from "@/lib/types";
import { ArchiveBudgetButton } from "./ArchiveBudgetButton";

export function BudgetCard({
  budget,
  projectId,
  showArchive,
}: {
  budget: ApiBudget;
  projectId: string;
  showArchive: boolean;
}) {
  const totals = budgetTotalsOrFallback(budget);
  const isArchived = budget.status === "ARCHIVED";

  return (
    <li>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link href={`/budgets/${budget.id}`} className="text-xl font-semibold hover:underline">
            {budget.title}
          </Link>
          <div className="flex flex-wrap gap-2">
            {isArchived ? (
              <span className="rounded-full bg-zinc-200 px-3 py-1 text-sm font-medium dark:bg-zinc-700">
                {budgetStatusLabel(budget.status)}
              </span>
            ) : null}
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {requiresReceiptLabel(budget.requiresReceipt)}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-sm text-zinc-500">Сумма</dt>
            <dd className="mt-1 font-semibold">{formatMoney(totals.amount, budget.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Подтверждено</dt>
            <dd className="mt-1 font-semibold">{formatMoney(totals.confirmedSpent, budget.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Ожидает чек</dt>
            <dd className="mt-1 font-semibold">{formatMoney(totals.pendingSpent, budget.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Всего расходов</dt>
            <dd className="mt-1 font-semibold">{formatMoney(totals.totalSpent, budget.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Остаток (подтв.)</dt>
            <dd className="mt-1 font-semibold text-emerald-700 dark:text-emerald-400">
              {formatMoney(totals.confirmedRemaining, budget.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Остаток (с ожид.)</dt>
            <dd className="mt-1 font-semibold">{formatMoney(totals.projectedRemaining, budget.currency)}</dd>
          </div>
        </dl>

        {showArchive && !isArchived ? (
          <ArchiveBudgetButton budgetId={budget.id} projectId={projectId} />
        ) : null}
      </div>
    </li>
  );
}
