"use client";

import { useActionState } from "react";
import { createProjectBudget, type BudgetFormState } from "./actions";
import type { ApiUser } from "@/lib/types";

export function CreateBudgetForm({
  projectId,
  actorUserId,
  users,
}: {
  projectId: string;
  actorUserId: string;
  users: ApiUser[];
}) {
  const [state, formAction, pending] = useActionState<BudgetFormState | undefined, FormData>(
    createProjectBudget,
    undefined,
  );

  return (
    <details className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer px-6 py-4 text-lg font-semibold">Создать бюджет</summary>
      <form action={formAction} className="space-y-4 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="actorUserId" value={actorUserId} />

        {state?.ok === false && state.message ? (
          <p className="rounded-lg bg-red-50 p-3 text-base text-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
            {state.message}
          </p>
        ) : null}
        {state?.ok === true ? (
          <p className="rounded-lg bg-emerald-50 p-3 text-base text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Бюджет создан
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
          <input
            name="description"
            className="w-full rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Ключевые слова для распознавания
          </span>
          <input
            name="matchingKeywords"
            placeholder="например: реклама, вк, таргет, паблик"
            className="w-full rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">Сумма (₽)</span>
          <input
            name="amount"
            type="number"
            min={0.01}
            step={0.01}
            required
            className="w-full rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>

        <label className="flex items-center gap-2">
          <input name="requiresReceipt" type="checkbox" className="h-5 w-5 rounded" />
          <span className="text-base">Чек обязателен (отчётность)</span>
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Доступ сотрудников</legend>
          <ul className="max-h-40 space-y-2 overflow-y-auto">
            {users.map((u) => (
              <li key={u.id}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="accessUserIds" value={u.id} className="h-4 w-4 rounded" />
                  <span>{u.fullName}</span>
                  <span className="text-sm text-zinc-500">{u.role}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-zinc-900 px-4 py-3 text-base font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Создание…" : "Создать"}
        </button>
      </form>
    </details>
  );
}
