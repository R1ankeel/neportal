"use client";

import { useActionState } from "react";
import { updateEmployeeUsername } from "./actions";

export function EditUsernameForm({
  userId,
  currentUsername,
}: {
  userId: string;
  currentUsername: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateEmployeeUsername, undefined);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="telegramUsername"
        defaultValue={currentUsername ?? ""}
        placeholder="username"
        className="min-w-[8rem] flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-950"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-zinc-300 px-2 py-1 text-sm font-medium dark:border-zinc-600"
      >
        {pending ? "…" : "Сохранить"}
      </button>
      {state?.ok === false && state.message ? (
        <span className="w-full text-xs text-red-600 dark:text-red-400">{state.message}</span>
      ) : null}
    </form>
  );
}
