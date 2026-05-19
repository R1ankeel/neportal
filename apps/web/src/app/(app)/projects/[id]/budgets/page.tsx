import Link from "next/link";
import { apiGet } from "@/lib/api";
import { budgetRemainder, formatMoney, parseAmount } from "@/lib/format";
import type { ApiBudget } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectBudgetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let budgets: ApiBudget[] = [];
  let error: string | null = null;
  try {
    budgets = await apiGet<ApiBudget[]>("/budgets", { projectId: id });
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Бюджеты проекта</h2>
      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">{error}</p>
      ) : null}

      <ul className="space-y-4">
        {budgets.length === 0 && !error ? (
          <li className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            Бюджетов нет
          </li>
        ) : (
          budgets.map((b) => {
            const initial = parseAmount(b.initialAmount);
            const spent = parseAmount(b.spentAmount);
            const left = budgetRemainder(b);
            return (
              <li key={b.id}>
                <Link
                  href={`/budgets/${b.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <h3 className="text-xl font-semibold">{b.title}</h3>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-sm text-zinc-500">Сумма</dt>
                      <dd className="mt-1 text-lg font-semibold">{formatMoney(initial, b.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-zinc-500">Потрачено</dt>
                      <dd className="mt-1 text-lg font-semibold">{formatMoney(spent, b.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-zinc-500">Остаток</dt>
                      <dd className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatMoney(left, b.currency)}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
