import { apiGet } from "@/lib/api";
import { formatDate, taskStatusLabel } from "@/lib/format";
import type { ApiTask } from "@/lib/types";
import { TaskStatusActions } from "./TaskStatusActions";

export const dynamic = "force-dynamic";

export default async function ProjectTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let tasks: ApiTask[] = [];
  let error: string | null = null;
  try {
    tasks = await apiGet<ApiTask[]>("/tasks", { projectId: id });
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Задачи проекта</h2>
      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-base md:text-lg">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300">
              <th className="px-4 py-3 font-semibold">Задача</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Статус</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">Автор</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">Исполнитель</th>
              <th className="px-4 py-3 font-semibold">Дедлайн</th>
              <th className="px-4 py-3 font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && !error ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Задач нет
                </td>
              </tr>
            ) : (
              tasks.map((t) => (
                <tr key={t.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium">{t.title}</div>
                    <div className="mt-1 text-sm text-zinc-500 md:hidden">
                      {taskStatusLabel(t.status)} · {t.creator?.fullName ?? "—"}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 align-top md:table-cell">{taskStatusLabel(t.status)}</td>
                  <td className="hidden px-4 py-3 align-top lg:table-cell">{t.creator?.fullName ?? "—"}</td>
                  <td className="hidden px-4 py-3 align-top lg:table-cell">{t.assignee?.fullName ?? "—"}</td>
                  <td className="px-4 py-3 align-top">{formatDate(t.deadlineAt)}</td>
                  <td className="px-4 py-3 align-top">
                    <TaskStatusActions taskId={t.id} projectId={id} current={t.status} />
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
