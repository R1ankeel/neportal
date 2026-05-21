"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEmployee } from "./actions";

export function DeleteEmployeeButton({
  userId,
  fullName,
}: {
  userId: string;
  fullName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (
      !window.confirm(
        `Удалить сотрудника ${fullName}? История задач, расходов и заметок сохранится.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteEmployee(userId);
      if (!result.ok) {
        setError(result.message ?? "Ошибка удаления");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg border border-zinc-300 px-2 py-1 text-sm font-medium text-zinc-700 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300"
      >
        {pending ? "Удаление…" : "Удалить"}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
