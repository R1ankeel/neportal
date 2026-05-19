import Link from "next/link";
import { apiGet } from "@/lib/api";
import { budgetRemainder, formatMoney, parseAmount } from "@/lib/format";
import type { ApiBudget, ApiProject, ApiTask } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let projects: ApiProject[] = [];
  let tasks: ApiTask[] = [];
  let budgets: ApiBudget[] = [];
  let error: string | null = null;

  try {
    [projects, tasks, budgets] = await Promise.all([
      apiGet<ApiProject[]>("/projects"),
      apiGet<ApiTask[]>("/tasks"),
      apiGet<ApiBudget[]>("/budgets"),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка загрузки";
  }

  const totalBudgetInitial = budgets.reduce((s, b) => s + parseAmount(b.initialAmount), 0);
  const totalBudgetSpent = budgets.reduce((s, b) => s + parseAmount(b.spentAmount), 0);
  const totalRemainder = totalBudgetInitial - totalBudgetSpent;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Главная</h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">Обзор по организации</p>
      </header>

      {error ? (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-lg text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          role="alert"
        >
          <p className="font-medium">Не удалось связаться с API</p>
          <p className="mt-2 text-base opacity-90">{error}</p>
          <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400">
            Убедитесь, что задан <code className="rounded bg-white/60 px-1 dark:bg-black/30">API_URL</code> и запущен
            бэкенд.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Проекты"
          value={String(projects.length)}
          hint="активных записей"
          href="/projects"
        />
        <DashboardCard title="Задачи" value={String(tasks.length)} hint="всего" href="/tasks" />
        <DashboardCard title="Бюджеты" value={String(budgets.length)} hint="карточек" href="/budgets" />
        <DashboardCard
          title="Остаток бюджетов"
          value={formatMoney(totalRemainder, "RUB")}
          hint="сумма по всем"
          href="/budgets"
        />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold">Бюджеты кратко</h2>
        <ul className="mt-4 space-y-3">
          {budgets.length === 0 ? (
            <li className="text-lg text-zinc-500">Нет бюджетов</li>
          ) : (
            budgets.slice(0, 5).map((b) => (
              <li key={b.id} className="flex flex-col gap-1 border-b border-zinc-100 pb-3 last:border-0 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/budgets/${b.id}`} className="text-lg font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                  {b.title}
                </Link>
                <span className="text-lg text-zinc-600 dark:text-zinc-400">
                  Остаток:{" "}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {formatMoney(budgetRemainder(b), b.currency)}
                  </strong>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function DashboardCard({
  title,
  value,
  hint,
  href,
}: {
  title: string;
  value: string;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <p className="text-base font-medium text-zinc-500 dark:text-zinc-400">{title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{value}</p>
      <p className="mt-2 text-base text-zinc-500 dark:text-zinc-400">{hint}</p>
    </Link>
  );
}
