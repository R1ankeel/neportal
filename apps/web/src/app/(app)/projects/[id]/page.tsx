import Link from "next/link";
import { apiGet } from "@/lib/api";
import { budgetRemainder, formatDateTime, formatMoney, taskStatusLabel } from "@/lib/format";
import type { ApiBudget, ApiNote, ApiTask } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let tasks: ApiTask[] = [];
  let budgets: ApiBudget[] = [];
  let notes: ApiNote[] = [];
  let error: string | null = null;

  try {
    [tasks, budgets, notes] = await Promise.all([
      apiGet<ApiTask[]>("/tasks", { projectId: id }),
      apiGet<ApiBudget[]>("/budgets", { projectId: id }),
      apiGet<ApiNote[]>("/notes", { projectId: id }),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  const recentTasks = tasks.slice(0, 5);
  const activeBudgets = budgets.filter((b) => b.status === "ACTIVE").slice(0, 5);
  const recentNotes = notes.slice(0, 5);

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">{error}</p>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Последние задачи</h2>
          <Link href={`/projects/${id}/tasks`} className="text-base font-medium text-zinc-600 hover:underline dark:text-zinc-400">
            Все задачи →
          </Link>
        </div>
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          {recentTasks.length === 0 ? (
            <li className="py-4 text-lg text-zinc-500">Задач пока нет</li>
          ) : (
            recentTasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <span className="text-lg font-medium">{t.title}</span>
                <span className="text-sm text-zinc-500">{taskStatusLabel(t.status)}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Активные бюджеты</h2>
          <Link href={`/projects/${id}/budgets`} className="text-base font-medium text-zinc-600 hover:underline dark:text-zinc-400">
            Все бюджеты →
          </Link>
        </div>
        <ul className="mt-4 space-y-3">
          {activeBudgets.length === 0 ? (
            <li className="text-lg text-zinc-500">Нет активных бюджетов</li>
          ) : (
            activeBudgets.map((b) => (
              <li key={b.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/budgets/${b.id}`} className="text-lg font-medium hover:underline">
                  {b.title}
                </Link>
                <span className="text-base text-zinc-600 dark:text-zinc-400">
                  Остаток: {formatMoney(budgetRemainder(b), b.currency)}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold">Последние заметки</h2>
        {recentNotes.length === 0 ? (
          <p className="mt-4 text-lg text-zinc-500">Заметок пока нет</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {recentNotes.map((n) => (
              <li key={n.id} className="border-b border-zinc-100 pb-3 last:border-0 dark:border-zinc-800">
                <p className="text-base text-zinc-600 dark:text-zinc-400">{formatDateTime(n.createdAt)}</p>
                <p className="mt-1 text-lg">{n.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
