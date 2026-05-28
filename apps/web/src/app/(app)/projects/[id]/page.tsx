import Link from "next/link";
import { TaskTitleCell } from "@/components/TaskTitleCell";
import { ProjectPageShell } from "@/components/projects/ProjectPageShell";
import { apiGet } from "@/lib/api";
import { withActorQuery } from "@/lib/actor-user";
import { resolveProjectActor } from "@/lib/resolve-project-actor";
import { budgetRemainder, formatMoney, taskStatusLabel } from "@/lib/format";
import type { ApiBudget, ApiTask } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { actorUserId, users } = await resolveProjectActor(sp, `/projects/${id}`);

  if (!actorUserId) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          Нет пользователей. Сначала создайте сотрудника.
        </p>
      </div>
    );
  }

  let tasks: ApiTask[] = [];
  let budgets: ApiBudget[] = [];
  let error: string | null = null;

  try {
    [tasks, budgets] = await Promise.all([
      apiGet<ApiTask[]>("/tasks", { actorUserId, projectId: id }),
      apiGet<ApiBudget[]>("/budgets", { actorUserId, projectId: id }),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  const recentTasks = tasks.slice(0, 5);
  const activeBudgets = budgets.filter((b) => b.status === "ACTIVE").slice(0, 5);

  return (
    <ProjectPageShell projectId={id} actorUserId={actorUserId} users={users}>
      <div className="space-y-8">
        {error ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            {error}
          </p>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Последние задачи</h2>
            <Link
              href={withActorQuery(`/projects/${id}/tasks`, actorUserId)}
              className="text-base font-medium text-zinc-600 hover:underline dark:text-zinc-400"
            >
              Все задачи →
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
            {recentTasks.length === 0 ? (
              <li className="py-4 text-lg text-zinc-500">Задач пока нет</li>
            ) : (
              recentTasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <TaskTitleCell task={t} actorUserId={actorUserId} />
                  <span className="shrink-0 text-sm text-zinc-500">{taskStatusLabel(t.status)}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Активные бюджеты</h2>
            <Link
              href={withActorQuery(`/projects/${id}/budgets`, actorUserId)}
              className="text-base font-medium text-zinc-600 hover:underline dark:text-zinc-400"
            >
              Все бюджеты →
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {activeBudgets.length === 0 ? (
              <li className="text-lg text-zinc-500">Нет активных бюджетов</li>
            ) : (
              activeBudgets.map((b) => (
                <li key={b.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    href={withActorQuery(`/budgets/${b.id}`, actorUserId)}
                    className="text-lg font-medium hover:underline"
                  >
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
          <h2 className="text-xl font-semibold">Заметки</h2>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
            Заметки личные и не привязаны к проекту. Откройте вкладку «Заметки» или{" "}
            <Link href={withActorQuery("/notes", actorUserId)} className="font-medium hover:underline">
              глобальный раздел
            </Link>
            .
          </p>
        </section>
      </div>
    </ProjectPageShell>
  );
}
