import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGet } from "@/lib/api";
import {
  budgetStatusLabel,
  budgetTotalsOrFallback,
  expenseSourceLabel,
  expenseStatusLabel,
  formatDateTime,
  formatMoney,
  requiresReceiptLabel,
} from "@/lib/format";
import type { ApiBudget, ApiUser } from "@/lib/types";
import { AddExpenseForm } from "./AddExpenseForm";
import { ExpenseAttachments } from "./ExpenseAttachments";
import { UploadReceiptForm } from "./UploadReceiptForm";

export const dynamic = "force-dynamic";

export default async function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let budget: ApiBudget;
  let users: ApiUser[];

  try {
    [budget, users] = await Promise.all([
      apiGet<ApiBudget>(`/budgets/${id}`),
      apiGet<ApiUser[]>("/users"),
    ]);
  } catch {
    notFound();
  }

  const totals = budgetTotalsOrFallback(budget);
  const expenses = budget.expenses ?? [];
  const isArchived = budget.status === "ARCHIVED";
  const uploaderId = users.find((u) => u.role === "OWNER")?.id ?? users[0]?.id ?? "";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <nav className="flex flex-wrap gap-x-2 gap-y-1 text-base text-zinc-500 dark:text-zinc-400">
        {budget.project ? (
          <>
            <Link href={`/projects/${budget.project.id}`} className="hover:underline">
              ← {budget.project.name}
            </Link>
            <span aria-hidden="true">·</span>
            <Link href={`/projects/${budget.project.id}/budgets`} className="hover:underline">
              Бюджеты проекта
            </Link>
          </>
        ) : (
          <Link href="/budgets" className="hover:underline">
            ← Бюджеты
          </Link>
        )}
      </nav>

      {isArchived ? (
        <p
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-lg text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
          role="status"
        >
          Бюджет в архиве. Операции запрещены.
        </p>
      ) : null}

      <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-3xl font-semibold md:text-4xl">{budget.title}</h1>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium dark:bg-zinc-800">
              {budgetStatusLabel(budget.status)}
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {requiresReceiptLabel(budget.requiresReceipt)}
            </span>
          </div>
        </div>
        {budget.description ? (
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">{budget.description}</p>
        ) : null}
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-zinc-500">Сумма</dt>
            <dd className="mt-1 text-2xl font-semibold">{formatMoney(totals.amount, budget.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-zinc-500">Подтверждённые расходы</dt>
            <dd className="mt-1 text-2xl font-semibold">{formatMoney(totals.confirmedSpent, budget.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-zinc-500">Неподтверждённые</dt>
            <dd className="mt-1 text-2xl font-semibold">{formatMoney(totals.pendingSpent, budget.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-zinc-500">Всего расходов</dt>
            <dd className="mt-1 text-2xl font-semibold">{formatMoney(totals.totalSpent, budget.currency)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-zinc-500">Остаток (подтвержд.)</dt>
            <dd className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
              {formatMoney(totals.confirmedRemaining, budget.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-zinc-500">Остаток (с ожиданием)</dt>
            <dd className="mt-1 text-2xl font-semibold">{formatMoney(totals.projectedRemaining, budget.currency)}</dd>
          </div>
        </dl>
        {budget.accessUsers && budget.accessUsers.length > 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            Доступ: {budget.accessUsers.map((u) => u.fullName).join(", ")}
          </p>
        ) : null}
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold">История расходов</h2>
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          {expenses.length === 0 ? (
            <li className="py-6 text-lg text-zinc-500">Расходов пока нет</li>
          ) : (
            expenses.map((e) => {
              const attachments = e.attachments ?? [];
              return (
                <li key={e.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-medium">{formatMoney(Number(e.amount), e.currency)}</p>
                    <p className="text-base text-zinc-500">{formatDateTime(e.expenseDate)}</p>
                    {e.description ? (
                      <p className="mt-1 text-base text-zinc-600 dark:text-zinc-400">{e.description}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-zinc-500">{e.user?.fullName ?? "—"}</p>
                    {e.status === "PENDING_RECEIPT" && !isArchived && uploaderId ? (
                      <UploadReceiptForm expenseId={e.id} budgetId={id} uploadedById={uploaderId} />
                    ) : (
                      <ExpenseAttachments attachments={attachments} />
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      {expenseSourceLabel(e.source)}
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        e.status === "PENDING_RECEIPT"
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-zinc-500"
                      }`}
                    >
                      {expenseStatusLabel(e.status)}
                    </span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>

      {!isArchived ? <AddExpenseForm budgetId={id} users={users} /> : null}
    </div>
  );
}
