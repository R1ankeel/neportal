"use client";

import { useActionState, useEffect, useState } from "react";
import { updateTaskDescription, type UpdateDescriptionState } from "./actions";
import {
  TaskFieldEditActions,
  TaskFieldEditTrigger,
  TaskFieldError,
  taskFieldErrorMessage,
} from "./task-edit";

const DESCRIPTION_ERROR = taskFieldErrorMessage("описание");

const textareaClassName =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-lg dark:border-zinc-600 dark:bg-zinc-950";

function normalizeDescription(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function TaskDescriptionEditor({
  taskId,
  initialDescription,
  projectId,
}: {
  taskId: string;
  initialDescription: string | null;
  projectId?: string | null;
}) {
  const [description, setDescription] = useState<string | null>(normalizeDescription(initialDescription));
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [state, formAction, pending] = useActionState<UpdateDescriptionState | undefined, FormData>(
    updateTaskDescription,
    undefined,
  );

  useEffect(() => {
    setDescription(normalizeDescription(initialDescription));
  }, [initialDescription]);

  useEffect(() => {
    if (state?.ok) {
      setDescription(state.description);
      setEditing(false);
    }
  }, [state]);

  function startEdit() {
    setInputValue(description ?? "");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setInputValue("");
  }

  const normalizedInput = normalizeDescription(inputValue);
  const unchanged = normalizedInput === description;
  const errorMessage = state?.ok === false ? (state.message ?? DESCRIPTION_ERROR) : null;

  if (editing) {
    return (
      <div className="mt-6">
        <h2 className="text-sm font-medium text-zinc-500">Описание</h2>
        <form action={formAction} className="mt-2 space-y-2">
          <input type="hidden" name="taskId" value={taskId} />
          {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
          <textarea
            name="description"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            rows={5}
            disabled={pending}
            placeholder="Описание задачи…"
            className={textareaClassName}
          />
          {errorMessage ? <TaskFieldError message={errorMessage} /> : null}
          <TaskFieldEditActions pending={pending} saveDisabled={unchanged} onCancel={cancelEdit} />
        </form>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-zinc-500">Описание</h2>
        <TaskFieldEditTrigger onClick={startEdit} />
      </div>
      {description ? (
        <p className="mt-2 whitespace-pre-line text-lg text-zinc-700 dark:text-zinc-300">{description}</p>
      ) : (
        <p className="mt-2 text-lg text-zinc-500 dark:text-zinc-400">Без описания</p>
      )}
    </div>
  );
}
