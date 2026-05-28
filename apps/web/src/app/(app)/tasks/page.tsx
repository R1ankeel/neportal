import { redirect } from "next/navigation";
import { ActorUserSelector } from "@/components/notes/ActorUserSelector";
import { TaskTitleCell } from "@/components/TaskTitleCell";
import { apiGet } from "@/lib/api";
import {
  pickDefaultActorUserId,
  readActorUserIdFromSearchParams,
} from "@/lib/actor-user";
import { formatDate, taskStatusLabel } from "@/lib/format";
import type { ApiTask, ApiUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const users = await apiGet<ApiUser[]>("/users");
  const defaultActor = pickDefaultActorUserId(users);
  if (!defaultActor) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-3xl font-semibold md:text-4xl">Задачи</h1>
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          Нет пользователей.
        </p>
      </div>
    );
  }

  const actorUserId = readActorUserIdFromSearchParams(sp);
  if (!actorUserId) {
    redirect(`/tasks?actorUserId=${encodeURIComponent(defaultActor)}`);
  }

  let tasks: ApiTask[] = [];
  let error: string | null = null;
  try {
    tasks = await apiGet<ApiTask[]>("/tasks", { actorUserId });
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold md:text-4xl">Задачи</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">Статус, исполнитель, дедлайн</p>
        <ActorUserSelector users={users} actorUserId={actorUserId} />
      </header>

      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-base md:text-lg">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300">
              <th className="px-4 py-4 font-semibold">Задача</th>
              <th className="hidden px-4 py-4 font-semibold sm:table-cell">Статус</th>
              <th className="hidden px-4 py-4 font-semibold md:table-cell">Исполнитель</th>
              <th className="px-4 py-4 font-semibold">Дедлайн</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && !error ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-zinc-500">
                  Задач нет
                </td>
              </tr>
            ) : (
              tasks.map((t) => (
                <tr key={t.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-4 align-top">
                    <TaskTitleCell task={t} actorUserId={actorUserId} />
                    <div className="mt-1 text-sm text-zinc-500 sm:hidden">
                      {taskStatusLabel(t.status)}
                      {t.assignee ? ` · ${t.assignee.fullName}` : ""}
                    </div>
                  </td>
                  <td className="hidden px-4 py-4 align-top sm:table-cell">
                    <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium dark:bg-zinc-800">
                      {taskStatusLabel(t.status)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-4 align-top text-zinc-700 dark:text-zinc-300 md:table-cell">
                    {t.assignee?.fullName ?? "—"}
                  </td>
                  <td className="px-4 py-4 align-top text-zinc-700 dark:text-zinc-300">
                    {formatDate(t.deadlineAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
