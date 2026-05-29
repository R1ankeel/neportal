"use client";

import { useActionState } from "react";
import { updateTaskStatus } from "./actions";

const transitions: { label: string; status: string }[] = [
  { label: "Новая", status: "NEW" },
  { label: "В работе", status: "IN_PROGRESS" },
  { label: "Выполнена", status: "DONE" },
  { label: "Отмена", status: "CANCELLED" },
];

export function TaskStatusActions({
  taskId,
  projectId,
  current,
  actorUserId,
}: {
  taskId: string;
  projectId: string;
  current: string;
  actorUserId: string;
}) {
  const [state, formAction, pending] = useActionState(updateTaskStatus, undefined);

  return (
    <div className="flex flex-wrap gap-2">
      {state?.ok === false ? (
        <span className="w-full text-sm text-red-600 dark:text-red-400">{state.message}</span>
      ) : null}
      {transitions.map((t) => (
        <form key={t.status} action={formAction} className="inline">
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="status" value={t.status} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="actorUserId" value={actorUserId} />
          <button
            type="submit"
            disabled={pending || current === t.status}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              current === t.status
                ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            } disabled:opacity-50`}
          >
            {t.label}
          </button>
        </form>
      ))}
    </div>
  );
}
