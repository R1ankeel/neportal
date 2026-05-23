"use client";

import { useActionState } from "react";
import { archiveProjectBudget, type BudgetFormState } from "./actions";

export function ArchiveBudgetButton({ budgetId, projectId }: { budgetId: string; projectId: string }) {
  const [state, formAction, pending] = useActionState<BudgetFormState | undefined, FormData>(
    archiveProjectBudget,
    undefined,
  );

  return (
    <form action={formAction} className="mt-4" onSubmit={(e) => {
      if (!confirm("Архивировать бюджет? Операции по нему будут запрещены.")) {
        e.preventDefault();
      }
    }}>
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="projectId" value={projectId} />
      {state?.ok === false && state.message ? (
        <p className="mb-2 text-sm text-red-600 dark:text-red-400">{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40"
      >
        {pending ? "Архивация…" : "Архивировать"}
      </button>
    </form>
  );
}
