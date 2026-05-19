"use client";

import { useActionState } from "react";
import { addBudgetExpense } from "./actions";
import type { ApiUser } from "@/lib/types";

export function AddExpenseForm({ budgetId, users }: { budgetId: string; users: ApiUser[] }) {
  const [state, formAction, pending] = useActionState(addBudgetExpense, undefined);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-xl font-semibold">Добавить расход</h2>
      <p className="mt-1 text-base text-zinc-500 dark:text-zinc-400">Вручную (источник: WEB)</p>

      {state?.ok === false && state.message ? (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-base text-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {state.message}
        </p>
      ) : null}
      {state?.ok === true && state.saved ? (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-base text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          Расход добавлен
        </p>
      ) : null}

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="budgetId" value={budgetId} />

        <label className="block">
          <span className="mb-2 block text-base font-medium text-zinc-700 dark:text-zinc-300">Сотрудник</span>
          <select
            name="userId"
            required
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-lg dark:border-zinc-600 dark:bg-zinc-950"
            defaultValue=""
          >
            <option value="" disabled>
              Выберите…
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-base font-medium text-zinc-700 dark:text-zinc-300">Сумма (₽)</span>
          <input
            name="amount"
            type="number"
            min={0.01}
            step={0.01}
            required
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-lg dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-base font-medium text-zinc-700 dark:text-zinc-300">Дата и время</span>
          <input
            name="expenseDate"
            type="datetime-local"
            required
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-lg dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-base font-medium text-zinc-700 dark:text-zinc-300">Комментарий</span>
          <input
            name="description"
            type="text"
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-lg dark:border-zinc-600 dark:bg-zinc-950"
            placeholder="Необязательно"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-zinc-900 px-4 py-4 text-lg font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {pending ? "Сохранение…" : "Добавить расход"}
        </button>
      </form>
    </div>
  );
}
