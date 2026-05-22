"use client";

import { useActionState } from "react";
import { addTaskComment, type AddCommentState } from "./actions";

const initial: AddCommentState = { ok: true };

export function AddCommentForm({
  taskId,
  authorId,
  projectId,
}: {
  taskId: string;
  authorId: string;
  projectId?: string | null;
}) {
  const [state, action, pending] = useActionState(addTaskComment, initial);

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="authorId" value={authorId} />
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      <textarea
        name="text"
        rows={3}
        required
        placeholder="Комментарий…"
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-950"
        disabled={pending}
      />
      {state.message ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">{state.message}</p>
      ) : null}
      {state.saved ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Комментарий добавлен</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-zinc-900 px-5 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Отправка…" : "Добавить комментарий"}
      </button>
    </form>
  );
}
