import Link from "next/link";
import { redirect } from "next/navigation";
import { ActorUserSelector } from "@/components/notes/ActorUserSelector";
import { apiGet } from "@/lib/api";
import {
  pickDefaultActorUserId,
  readActorUserIdFromSearchParams,
  withActorQuery,
} from "@/lib/actor-user";
import { budgetTotalsOrFallback, formatMoney } from "@/lib/format";
import type { ApiBudget, ApiUser } from "@/lib/types";

export const dynamic = "force-dynamic";

function groupBudgetsByProject(budgets: ApiBudget[]): Array<{
  projectId: string;
  projectName: string;
  budgets: ApiBudget[];
}> {
  const byProject = new Map<string, { projectName: string; budgets: ApiBudget[] }>();

  for (const budget of budgets) {
    const projectId = budget.project?.id ?? "";
    const projectName = budget.project?.name?.trim() || "Без проекта";
    const existing = byProject.get(projectId);
    if (existing) {
      existing.budgets.push(budget);
    } else {
      byProject.set(projectId, { projectName, budgets: [budget] });
    }
  }

  return [...byProject.entries()]
    .map(([projectId, group]) => ({
      projectId,
      projectName: group.projectName,
      budgets: group.budgets.sort((a, b) => a.title.localeCompare(b.title, "ru")),
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName, "ru"));
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const users = await apiGet<ApiUser[]>("/users");
  const defaultActor = pickDefaultActorUserId(users);
  if (!defaultActor) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-semibold md:text-4xl">Бюджеты</h1>
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          Нет пользователей.
        </p>
      </div>
    );
  }

  const actorUserId = readActorUserIdFromSearchParams(sp);
  if (!actorUserId) {
    redirect(`/budgets?actorUserId=${encodeURIComponent(defaultActor)}`);
  }

  let budgets: ApiBudget[] = [];
  let error: string | null = null;
  try {
    budgets = await apiGet<ApiBudget[]>("/budgets", { actorUserId });
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  const grouped = groupBudgetsByProject(budgets);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold md:text-4xl">Бюджеты</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Все доступные бюджеты по проектам
        </p>
        <ActorUserSelector users={users} actorUserId={actorUserId} />
      </header>

      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
        Сводка по всем проектам, к которым у выбранного пользователя есть доступ. Основной
        рабочий раздел — вкладка «Бюджеты» внутри конкретного проекта.
      </p>

      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          {error}
        </p>
      ) : null}

      {grouped.length === 0 && !error ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          Бюджетов нет
        </p>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.projectId || group.projectName} className="space-y-4">
              <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">
                {group.projectId ? (
                  <Link
                    href={withActorQuery(`/projects/${group.projectId}/budgets`, actorUserId)}
                    className="hover:underline"
                  >
                    Проект: {group.projectName}
                  </Link>
                ) : (
                  <>Проект: {group.projectName}</>
                )}
              </h2>
              <ul className="space-y-4">
                {group.budgets.map((b) => {
                  const totals = budgetTotalsOrFallback(b);
                  return (
                    <li key={b.id}>
                      <Link
                        href={withActorQuery(`/budgets/${b.id}`, actorUserId)}
                        className="block rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                      >
                        <h3 className="text-xl font-semibold md:text-2xl">{b.title}</h3>
                        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                          <div>
                            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                              Сумма
                            </dt>
                            <dd className="mt-1 text-2xl font-semibold">
                              {formatMoney(totals.amount, b.currency)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                              Подтверждено
                            </dt>
                            <dd className="mt-1 text-2xl font-semibold">
                              {formatMoney(totals.confirmedSpent, b.currency)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                              Остаток
                            </dt>
                            <dd className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
                              {formatMoney(totals.confirmedRemaining, b.currency)}
                            </dd>
                          </div>
                        </dl>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
