"use client";

import { useActionState, useEffect, useState } from "react";
import { deadlineToInputValue, formatTaskDeadline } from "@/lib/format";
import { updateTaskDeadline, type UpdateDeadlineState } from "./actions";

const DEADLINE_ERROR = "Не удалось изменить дедлайн. Попробуйте ещё раз.";

export function TaskDeadlineEditor({
  taskId,
  initialDeadlineAt,
  projectId,
}: {
  taskId: string;
  initialDeadlineAt: string | null;
  projectId?: string | null;
}) {
  const [deadlineAt, setDeadlineAt] = useState(initialDeadlineAt);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [state, formAction, pending] = useActionState<UpdateDeadlineState | undefined, FormData>(
    updateTaskDeadline,
    undefined,
  );

  useEffect(() => {
    setDeadlineAt(initialDeadlineAt);
  }, [initialDeadlineAt]);

  useEffect(() => {
    if (state?.ok) {
      setDeadlineAt(state.deadlineAt);
      setEditing(false);
    }
  }, [state]);

  function startEdit() {
    setInputValue(deadlineToInputValue(deadlineAt));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setInputValue("");
  }

  if (editing) {
    return (
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="taskId" value={taskId} />
        {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
        <input
          type="date"
          name="deadlineAt"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          required
          disabled={pending}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-600 dark:bg-zinc-950"
        />
        {state?.ok === false ? (
          <p className="text-sm text-red-600 dark:text-red-400">{DEADLINE_ERROR}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending || !inputValue}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Сохранение…" : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={pending}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Отмена
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-lg">{formatTaskDeadline(deadlineAt)}</span>
      <button
        type="button"
        onClick={startEdit}
        className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
      >
        Изменить
      </button>
    </div>
  );
}
