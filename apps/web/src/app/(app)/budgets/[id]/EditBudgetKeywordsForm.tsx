"use client";

import { useActionState } from "react";
import { updateBudgetMatchingKeywords, type BudgetKeywordsState } from "./actions";

export function EditBudgetKeywordsForm({
  budgetId,
  projectId,
  initialKeywords,
  disabled,
}: {
  budgetId: string;
  projectId?: string;
  initialKeywords: string | null | undefined;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState<BudgetKeywordsState | undefined, FormData>(
    updateBudgetMatchingKeywords,
    undefined,
  );

  return (
    <form action={formAction} className="mt-4 space-y-3 rounded-xl border border-zinc-100 p-4 dark:border-zinc-800">
      <input type="hidden" name="budgetId" value={budgetId} />
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Ключевые слова для распознавания
        </span>
        <input
          name="matchingKeywords"
          defaultValue={initialKeywords ?? ""}
          disabled={disabled}
          placeholder="например: реклама, вк, таргет, паблик"
          className="w-full rounded-xl border border-zinc-300 px-4 py-2 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
        />
      </label>

      {state?.ok === false && state.message ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {state.message}
        </p>
      ) : null}
      {state?.ok === true ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">Сохранено</p>
      ) : null}

      <button
        type="submit"
        disabled={disabled || pending}
        className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-zinc-600"
      >
        {pending ? "Сохранение…" : "Сохранить ключевые слова"}
      </button>
    </form>
  );
}
