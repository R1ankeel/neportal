import Link from "next/link";
import { apiGet } from "@/lib/api";
import type { ApiBudget, ApiUser } from "@/lib/types";
import { BudgetCard } from "./BudgetCard";
import { CreateBudgetForm } from "./CreateBudgetForm";

export const dynamic = "force-dynamic";

export default async function ProjectBudgetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const isArchivedTab = tab === "archived";

  let budgets: ApiBudget[] = [];
  let users: ApiUser[] = [];
  let error: string | null = null;

  try {
    [budgets, users] = await Promise.all([
      apiGet<ApiBudget[]>("/budgets", {
        projectId: id,
        status: isArchivedTab ? "ARCHIVED" : "ACTIVE",
      }),
      apiGet<ApiUser[]>("/users"),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Бюджеты проекта</h2>

      <nav className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <Link
          href={`/projects/${id}/budgets`}
          className={`border-b-2 px-4 py-2 text-base font-medium ${
            !isArchivedTab
              ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          Активные
        </Link>
        <Link
          href={`/projects/${id}/budgets?tab=archived`}
          className={`border-b-2 px-4 py-2 text-base font-medium ${
            isArchivedTab
              ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          Архивные
        </Link>
      </nav>

      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          {error}
        </p>
      ) : null}

      {!isArchivedTab ? <CreateBudgetForm projectId={id} users={users} /> : null}

      <ul className="space-y-4">
        {budgets.length === 0 && !error ? (
          <li className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            {isArchivedTab ? "Архивных бюджетов нет" : "Активных бюджетов нет"}
          </li>
        ) : (
          budgets.map((b) => (
            <BudgetCard key={b.id} budget={b} projectId={id} showArchive={!isArchivedTab} />
          ))
        )}
      </ul>
    </div>
  );
}
