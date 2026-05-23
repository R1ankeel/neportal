"use client";

import { useTransition } from "react";
import { cancelProjectAbsence } from "./actions";

type Props = {
  projectId: string;
  absenceId: string;
  employeeFullName: string;
  absenceKind: string;
  cancelledById: string;
};

export function CancelAbsenceButton({
  projectId,
  absenceId,
  employeeFullName,
  absenceKind,
  cancelledById,
}: Props) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const ok = window.confirm(
      `Удалить ${absenceKind} сотрудника ${employeeFullName}? Запись будет отменена, история сохранится.`,
    );
    if (!ok) return;

    startTransition(async () => {
      const result = await cancelProjectAbsence(projectId, absenceId, cancelledById);
      if (!result.ok && result.message) {
        window.alert(result.message);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
    >
      {pending ? "Удаление…" : "Удалить"}
    </button>
  );
}
