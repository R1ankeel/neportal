import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiGet } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { ApiProject, ApiProjectSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let project: ApiProject;
  let summary: ApiProjectSummary;
  try {
    [project, summary] = await Promise.all([
      apiGet<ApiProject>(`/projects/${id}`),
      apiGet<ApiProjectSummary>(`/projects/${id}/summary`),
    ]);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-base text-zinc-500 dark:text-zinc-400">
        <Link href="/projects" className="hover:underline">
          ← Все проекты
        </Link>
      </nav>

      <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-3xl font-semibold md:text-4xl">{project.name}</h1>
        {project.description ? (
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">{project.description}</p>
        ) : (
          <p className="mt-3 text-lg text-zinc-400">Без описания</p>
        )}

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
        </dl>
      </header>

      <ProjectTabs projectId={id} />
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
