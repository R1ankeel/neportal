import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGet } from "@/lib/api";
import { budgetRemainder, formatDateTime, formatMoney, parseAmount } from "@/lib/format";
import type { ApiBudget, ApiBudgetExpense, ApiUser } from "@/lib/types";
import { AddExpenseForm } from "./AddExpenseForm";

export const dynamic = "force-dynamic";

type BudgetDetail = ApiBudget;

export default async function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let budget: BudgetDetail;
  let expenses: ApiBudgetExpense[];
  let users: ApiUser[];

  try {
    [budget, expenses, users] = await Promise.all([
      apiGet<BudgetDetail>(`/budgets/${id}`),
      apiGet<ApiBudgetExpense[]>(`/budgets/${id}/expenses`),
      apiGet<ApiUser[]>("/users"),
    ]);
  } catch {
    notFound();
  }

  const initial = parseAmount(budget.initialAmount);
  const spent = parseAmount(budget.spentAmount);
  const left = budgetRemainder(budget);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <nav className="text-base text-zinc-500 dark:text-zinc-400">
        <Link href="/budgets" className="hover:underline">
          ← Бюджеты
        </Link>
      </nav>

      <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-3xl font-semibold md:text-4xl">{budget.title}</h1>
        {budget.description ? (
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">{budget.description}</p>
        ) : null}
        <dl className="mt-6 grid gap-6 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-zinc-500">Сумма</dt>
            <dd className="mt-1 text-2xl font-semibold">{formatMoney(initial, budget.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-zinc-500">Потрачено</dt>
            <dd className="mt-1 text-2xl font-semibold">{formatMoney(spent, budget.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-zinc-500">Остаток</dt>
            <dd className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
              {formatMoney(left, budget.currency)}
            </dd>
          </div>
        </dl>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold">История расходов</h2>
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          {expenses.length === 0 ? (
            <li className="py-6 text-lg text-zinc-500">Расходов пока нет</li>
          ) : (
            expenses.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-medium">{formatMoney(parseAmount(e.amount), e.currency)}</p>
                  <p className="text-base text-zinc-500">
                    {e.user?.fullName ?? "—"} · {formatDateTime(e.expenseDate)}
                  </p>
                  {e.description ? <p className="mt-1 text-base text-zinc-600">{e.description}</p> : null}
                </div>
                <span className="shrink-0 text-sm font-medium text-zinc-500">{e.status}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <AddExpenseForm budgetId={id} users={users} />
    </div>
  );
}
