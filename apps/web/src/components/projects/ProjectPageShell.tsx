import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectTabs } from "@/components/ProjectTabs";
import { ActorUserSelector } from "@/components/notes/ActorUserSelector";
import { apiGet } from "@/lib/api";
import { withActorQuery } from "@/lib/actor-user";
import { formatMoney } from "@/lib/format";
import type { ApiProject, ApiProjectSummary, ApiUser } from "@/lib/types";
import { archiveProject, restoreProject } from "@/app/(app)/projects/[id]/actions";

export async function ProjectPageShell({
  projectId,
  actorUserId,
  users,
  children,
}: {
  projectId: string;
  actorUserId: string;
  users: ApiUser[];
  children: React.ReactNode;
}) {
  let project: ApiProject;
  let summary: ApiProjectSummary;
  try {
    [project, summary] = await Promise.all([
      apiGet<ApiProject>(`/projects/${projectId}`, { actorUserId }),
      apiGet<ApiProjectSummary>(`/projects/${projectId}/summary`, { actorUserId }),
    ]);
  } catch {
    notFound();
  }

  const actorUser = users.find((u) => u.id === actorUserId);
  const isOwner = actorUser?.role === "OWNER";
  const isArchived = project.status === "ARCHIVED";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-base text-zinc-500 dark:text-zinc-400">
        <Link href={withActorQuery("/projects", actorUserId)} className="hover:underline">
          ← Все проекты
        </Link>
      </nav>

      <header className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <ActorUserSelector users={users} actorUserId={actorUserId} />
        {isArchived ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            Проект в архиве. Действия недоступны.
          </div>
        ) : null}
        <h1 className="text-3xl font-semibold md:text-4xl">{project.name}</h1>
        {project.description ? (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">{project.description}</p>
        ) : (
          <p className="text-lg text-zinc-400">Без описания</p>
        )}

        {isOwner ? (
          <div className="flex flex-wrap items-center gap-3">
            {isArchived ? (
              <form action={restoreProject}>
                <input type="hidden" name="actorUserId" value={actorUserId} />
                <input type="hidden" name="projectId" value={projectId} />
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-base font-semibold text-white hover:bg-emerald-700"
                >
                  Возобновить проект
                </button>
              </form>
            ) : (
              <form action={archiveProject}>
                <input type="hidden" name="actorUserId" value={actorUserId} />
                <input type="hidden" name="projectId" value={projectId} />
                <button
                  type="submit"
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-base font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  Архивировать проект
                </button>
              </form>
            )}
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {project.status}
            </span>
          </div>
        ) : (
          <span className="inline-flex w-fit rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {project.status}
          </span>
        )}

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Stat label="Задач" value={String(summary.tasksTotal)} />
          <Stat label="Новые" value={String(summary.tasksNew)} />
          <Stat label="В работе" value={String(summary.tasksInProgress)} />
          <Stat label="Выполнено" value={String(summary.tasksDone)} />
          <Stat label="Бюджетов" value={String(summary.budgetsTotal)} />
          <Stat
            label="Остаток бюджетов"
            value={formatMoney(summary.budgetsRemainingTotal, "RUB")}
            emphasize
          />
          <Stat label="Отсутствий" value={String(summary.absencesTotal)} />
          <Stat
            label="Сейчас отсутствуют"
            value={String(summary.absencesActiveNow)}
            emphasize={summary.absencesActiveNow > 0}
          />
        </dl>
      </header>

      <ProjectTabs projectId={projectId} actorUserId={actorUserId} />
      {children}
    </div>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={`mt-1 text-xl font-semibold ${emphasize ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-900 dark:text-zinc-100"}`}
      >
        {value}
      </dd>
    </div>
  );
}
