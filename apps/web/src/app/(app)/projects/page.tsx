import Link from "next/link";
import { apiGet } from "@/lib/api";
import type { ApiProject } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  let projects: ApiProject[] = [];
  let error: string | null = null;
  try {
    projects = await apiGet<ApiProject[]>("/projects");
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold md:text-4xl">Проекты</h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">Выберите проект — внутри задачи, бюджеты и заметки</p>
      </header>

      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">{error}</p>
      ) : null}

      <ul className="space-y-3">
        {projects.length === 0 && !error ? (
          <li className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            Проектов пока нет
          </li>
        ) : (
          projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{p.name}</h2>
                    {p.description ? (
                      <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">{p.description}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {p.status}
                  </span>
                </div>
                {p.createdBy ? (
                  <p className="mt-3 text-base text-zinc-500 dark:text-zinc-400">Создал: {p.createdBy.fullName}</p>
                ) : null}
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
