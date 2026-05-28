import Link from "next/link";
import { ProjectPageShell } from "@/components/projects/ProjectPageShell";
import { apiGet } from "@/lib/api";
import { withActorQuery } from "@/lib/actor-user";
import { resolveProjectActor } from "@/lib/resolve-project-actor";
import type { ApiBudget } from "@/lib/types";
import { BudgetCard } from "./BudgetCard";
import { CreateBudgetForm } from "./CreateBudgetForm";

export const dynamic = "force-dynamic";

export default async function ProjectBudgetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tabRaw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const isArchivedTab = tabRaw === "archived";
  const { actorUserId, users } = await resolveProjectActor(sp, `/projects/${id}/budgets`);

  if (!actorUserId) {
    return (
      <div className="mx-auto max-w-5xl p-6 text-lg text-amber-900 dark:text-amber-100">
        Нет пользователей.
      </div>
    );
  }

  let budgets: ApiBudget[] = [];
  let error: string | null = null;

  try {
    budgets = await apiGet<ApiBudget[]>("/budgets", {
      actorUserId,
      projectId: id,
      status: isArchivedTab ? "ARCHIVED" : "ACTIVE",
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <ProjectPageShell projectId={id} actorUserId={actorUserId} users={users}>
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Бюджеты проекта</h2>

        <nav className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <Link
            href={withActorQuery(`/projects/${id}/budgets`, actorUserId)}
            className={`border-b-2 px-4 py-2 text-base font-medium ${
              !isArchivedTab
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Активные
          </Link>
          <Link
            href={withActorQuery(`/projects/${id}/budgets`, actorUserId, { tab: "archived" })}
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

        {!isArchivedTab ? (
          <CreateBudgetForm projectId={id} actorUserId={actorUserId} users={users} />
        ) : null}

        <ul className="space-y-4">
          {budgets.length === 0 && !error ? (
            <li className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              {isArchivedTab ? "Архивных бюджетов нет" : "Активных бюджетов нет"}
            </li>
          ) : (
            budgets.map((b) => (
              <BudgetCard
                key={b.id}
                budget={b}
                projectId={id}
                actorUserId={actorUserId}
                showArchive={!isArchivedTab}
              />
            ))
          )}
        </ul>
      </div>
    </ProjectPageShell>
  );
}
