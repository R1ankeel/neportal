import Link from "next/link";
import { notFound } from "next/navigation";
import { AddCommentForm } from "./AddCommentForm";
import { apiGet } from "@/lib/api";
import {
  formatDate,
  formatDateTime,
  noteSourceLabel,
  taskStatusLabel,
  transferStatusLabel,
} from "@/lib/format";
import type { ApiTask, ApiUser } from "@/lib/types";
import { findWebAuthor } from "@/lib/webAuthor";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let task: ApiTask;
  let users: ApiUser[];

  try {
    [task, users] = await Promise.all([apiGet<ApiTask>(`/tasks/${id}`), apiGet<ApiUser[]>("/users")]);
  } catch {
    notFound();
  }

  const webAuthor = findWebAuthor(users);
  const comments = task.comments ?? [];
  const transfers = task.transfers ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <nav className="text-base text-zinc-500 dark:text-zinc-400">
        {task.project ? (
          <Link href={`/projects/${task.project.id}/tasks`} className="hover:underline">
            ← {task.project.name}
          </Link>
        ) : (
          <Link href="/tasks" className="hover:underline">
            ← Задачи
          </Link>
        )}
      </nav>

      <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="flex-1 text-3xl font-semibold md:text-4xl">{task.title}</h1>
          <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium dark:bg-zinc-800">
            {taskStatusLabel(task.status)}
          </span>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-zinc-500">Проект</dt>
            <dd className="mt-1 text-lg">
              {task.project ? (
                <Link href={`/projects/${task.project.id}`} className="hover:underline">
                  {task.project.name}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-zinc-500">Дедлайн</dt>
            <dd className="mt-1 text-lg">{formatDate(task.deadlineAt)}</dd>
          </div>
          {task.status === "IN_PROGRESS" && task.startedAt ? (
            <div>
              <dt className="text-sm font-medium text-zinc-500">В работе с</dt>
              <dd className="mt-1 text-lg">{formatDateTime(task.startedAt)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-sm font-medium text-zinc-500">Автор</dt>
            <dd className="mt-1 text-lg">{task.creator?.fullName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-zinc-500">Исполнитель</dt>
            <dd className="mt-1 text-lg">{task.assignee?.fullName ?? "—"}</dd>
          </div>
        </dl>

        {task.description ? (
          <div className="mt-6">
            <h2 className="text-sm font-medium text-zinc-500">Описание</h2>
            <p className="mt-2 whitespace-pre-wrap text-lg text-zinc-700 dark:text-zinc-300">{task.description}</p>
          </div>
        ) : null}

        {task.status === "DONE" && task.completionResult?.trim() ? (
          <div className="mt-6 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
            <h2 className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Результат выполнения</h2>
            <p className="mt-2 whitespace-pre-wrap text-lg text-emerald-900 dark:text-emerald-100">
              {task.completionResult.trim()}
            </p>
          </div>
        ) : null}

        {task.status === "CANCELLED" && task.cancellationReason?.trim() ? (
          <div className="mt-6 rounded-xl bg-amber-50 p-4 dark:bg-amber-950/40">
            <h2 className="text-sm font-medium text-amber-800 dark:text-amber-300">Причина отмены</h2>
            <p className="mt-2 whitespace-pre-wrap text-lg text-amber-900 dark:text-amber-100">
              {task.cancellationReason.trim()}
            </p>
          </div>
        ) : null}
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold">История передачи</h2>
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          {transfers.length === 0 ? (
            <li className="py-4 text-zinc-500">Передач пока нет</li>
          ) : (
            transfers.map((t) => (
              <li key={t.id} className="py-4 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-zinc-500">
                  <span>{formatDateTime(t.createdAt)}</span>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                    {transferStatusLabel(t.status)}
                  </span>
                </div>
                <p className="mt-2 text-lg text-zinc-800 dark:text-zinc-200">
                  {t.requestedBy.fullName}: {t.fromUser.fullName} → {t.toUser.fullName}
                </p>
                {t.comment?.trim() ? (
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">Комментарий: {t.comment.trim()}</p>
                ) : null}
                {t.status === "REJECTED" && t.rejectionReason?.trim() ? (
                  <p className="mt-1 text-amber-800 dark:text-amber-200">
                    Причина отказа: {t.rejectionReason.trim()}
                  </p>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold">Комментарии</h2>
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          {comments.length === 0 ? (
            <li className="py-4 text-zinc-500">Комментариев пока нет</li>
          ) : (
            comments.map((c) => (
              <li key={c.id} className="py-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-zinc-500">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{c.author.fullName}</span>
                  <span>{formatDateTime(c.createdAt)}</span>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">{noteSourceLabel(c.source)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-lg text-zinc-700 dark:text-zinc-300">{c.text}</p>
                {c.mentions && c.mentions.length > 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">
                    Упомянуты:{" "}
                    {c.mentions.map((m) => m.mentionedUser.fullName).join(", ")}
                  </p>
                ) : null}
              </li>
            ))
          )}
        </ul>

        {webAuthor ? (
          <AddCommentForm taskId={task.id} authorId={webAuthor.id} projectId={task.project?.id} />
        ) : (
          <p className="mt-4 text-amber-800 dark:text-amber-200">Нет пользователей для добавления комментария</p>
        )}
      </section>
    </div>
  );
}
