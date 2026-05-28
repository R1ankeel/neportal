"use client";

import { useActionState } from "react";
import { createProject, type ProjectFormState } from "@/app/(app)/projects/actions";

export function CreateProjectForm({ actorUserId }: { actorUserId: string }) {
  const [state, formAction, pending] = useActionState<ProjectFormState | undefined, FormData>(
    createProject,
    undefined,
  );

  return (
    <details className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer px-6 py-4 text-lg font-semibold">Создать проект</summary>
      <form action={formAction} className="space-y-4 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
        <input type="hidden" name="actorUserId" value={actorUserId} />

        {state?.ok === false && state.message ? (
          <p className="rounded-lg bg-red-50 p-3 text-base text-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
            {state.message}
          </p>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">Название</span>
          <input
            name="name"
            required
            className="w-full rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">Описание</span>
          <textarea
            name="description"
            rows={2}
            className="w-full rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-base font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Создание…" : "Создать"}
        </button>
      </form>
    </details>
  );
}
