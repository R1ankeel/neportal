"use client";

import { useActionState } from "react";
import { createEmployee } from "./actions";

const ROLES = [
  { value: "OWNER", label: "OWNER" },
  { value: "MANAGER", label: "MANAGER" },
  { value: "EMPLOYEE", label: "EMPLOYEE" },
  { value: "ACCOUNTANT", label: "ACCOUNTANT" },
] as const;

export function AddEmployeeForm() {
  const [state, formAction, pending] = useActionState(createEmployee, undefined);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-xl font-semibold">Добавить сотрудника</h2>
      <p className="mt-1 text-base text-zinc-500 dark:text-zinc-400">
        Укажите Telegram @username — сотрудник подтвердит привязку через /start в боте.
      </p>

      {state?.ok === false && state.message ? (
        <p
          className="mt-4 rounded-lg bg-red-50 p-3 text-base text-red-800 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
      {state?.ok === true ? (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-base text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          Сотрудник добавлен
        </p>
      ) : null}

      <form action={formAction} className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-2 block text-base font-medium text-zinc-700 dark:text-zinc-300">
            ФИО
          </span>
          <input
            name="fullName"
            required
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-lg dark:border-zinc-600 dark:bg-zinc-950"
            placeholder="Вася Пупкин"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-base font-medium text-zinc-700 dark:text-zinc-300">
            Роль
          </span>
          <select
            name="role"
            required
            defaultValue="EMPLOYEE"
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-lg dark:border-zinc-600 dark:bg-zinc-950"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-base font-medium text-zinc-700 dark:text-zinc-300">
            Telegram username
          </span>
          <input
            name="telegramUsername"
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-lg dark:border-zinc-600 dark:bg-zinc-950"
            placeholder="vasya_pupkin"
          />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-zinc-900 px-6 py-3 text-lg font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Сохранение…" : "Добавить"}
          </button>
        </div>
      </form>
    </div>
  );
}
