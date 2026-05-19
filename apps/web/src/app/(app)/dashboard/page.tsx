import Link from "next/link";
import { apiGet } from "@/lib/api";
import type { ApiProject, ApiUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let projects: ApiProject[] = [];
  let users: ApiUser[] = [];
  let error: string | null = null;

  try {
    [projects, users] = await Promise.all([apiGet<ApiProject[]>("/projects"), apiGet<ApiUser[]>("/users")]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка загрузки";
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Главная</h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
          Работа ведётся в разрезе проектов: откройте проект для задач, бюджетов и заметок.
        </p>
      </header>

      {error ? (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-lg text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          role="alert"
        >
          <p className="font-medium">Не удалось связаться с API</p>
          <p className="mt-2 text-base opacity-90">{error}</p>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/projects"
          className="block rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <p className="text-base font-medium text-zinc-500 dark:text-zinc-400">Проекты</p>
          <p className="mt-3 text-3xl font-semibold md:text-4xl">{projects.length}</p>
          <p className="mt-2 text-base text-zinc-500 dark:text-zinc-400">открыть список →</p>
        </Link>
        <Link
          href="/employees"
          className="block rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <p className="text-base font-medium text-zinc-500 dark:text-zinc-400">Сотрудники</p>
          <p className="mt-3 text-3xl font-semibold md:text-4xl">{users.length}</p>
          <p className="mt-2 text-base text-zinc-500 dark:text-zinc-400">каталог →</p>
        </Link>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold">Недавние проекты</h2>
        <ul className="mt-4 space-y-2">
          {projects.slice(0, 6).map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="text-lg font-medium text-zinc-800 hover:underline dark:text-zinc-100">
                {p.name}
              </Link>
            </li>
          ))}
          {projects.length === 0 && !error ? (
            <li className="text-lg text-zinc-500">Пока нет проектов</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
