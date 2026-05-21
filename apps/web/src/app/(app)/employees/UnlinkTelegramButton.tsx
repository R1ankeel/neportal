"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unlinkEmployeeTelegram } from "./actions";

export function UnlinkTelegramButton({
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
    if (!window.confirm(`Отвязать Telegram от сотрудника ${fullName}?`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await unlinkEmployeeTelegram(userId);
      if (!result.ok) {
        setError(result.message ?? "Ошибка отвязки");
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
        className="rounded-lg border border-red-300 px-2 py-1 text-sm font-medium text-red-700 disabled:opacity-60 dark:border-red-800 dark:text-red-400"
      >
        {pending ? "Отвязка…" : "Отвязать Telegram"}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
