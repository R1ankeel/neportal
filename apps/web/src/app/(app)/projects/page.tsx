import Link from "next/link";
import { redirect } from "next/navigation";
import { ActorUserSelector } from "@/components/notes/ActorUserSelector";
import { CreateProjectForm } from "@/components/projects/CreateProjectForm";
import { apiGet } from "@/lib/api";
import { pickDefaultActorUserId, readActorUserIdFromSearchParams, withActorQuery } from "@/lib/actor-user";
import type { ApiProject, ApiUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
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
        <h1 className="text-3xl font-semibold md:text-4xl">Проекты</h1>
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          Нет пользователей. Сначала создайте сотрудника.
        </p>
      </div>
    );
  }

  const actorUserId = readActorUserIdFromSearchParams(sp);
  if (!actorUserId) {
    redirect(`/projects?actorUserId=${encodeURIComponent(defaultActor)}`);
  }

  const actorUser = users.find((u) => u.id === actorUserId);
  const isOwner = actorUser?.role === "OWNER";

  let projects: ApiProject[] = [];
  let error: string | null = null;
  try {
    projects = await apiGet<ApiProject[]>("/projects", { actorUserId });
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold md:text-4xl">Проекты</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Выберите проект — внутри задачи, бюджеты и отсутствия
        </p>
        <ActorUserSelector users={users} actorUserId={actorUserId} />
      </header>

      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          {error}
        </p>
      ) : null}

      {isOwner ? <CreateProjectForm actorUserId={actorUserId} /> : null}

      <ul className="space-y-3">
        {projects.length === 0 && !error ? (
          <li className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            {isOwner
              ? "Проектов пока нет. Создайте первый проект с помощью формы выше."
              : "Вас ещё не добавили ни в один проект. Обратитесь к владельцу организации."}
          </li>
        ) : (
          projects.map((p) => (
            <li key={p.id}>
              <Link
                href={withActorQuery(`/projects/${p.id}`, actorUserId)}
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
                  <p className="mt-3 text-base text-zinc-500 dark:text-zinc-400">
                    Создал: {p.createdBy.fullName}
                  </p>
                ) : null}
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
