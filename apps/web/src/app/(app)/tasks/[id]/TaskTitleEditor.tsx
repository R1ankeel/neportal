"use client";

import { useActionState, useEffect, useState } from "react";
import { updateTaskTitle, type UpdateTitleState } from "./actions";
import {
  TaskFieldEditActions,
  TaskFieldEditTrigger,
  TaskFieldError,
  taskFieldErrorMessage,
} from "./task-edit";

const TITLE_ERROR = taskFieldErrorMessage("название");

const inputClassName =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-2xl font-semibold dark:border-zinc-600 dark:bg-zinc-950 md:text-3xl";

export function TaskTitleEditor({
  taskId,
  initialTitle,
  projectId,
}: {
  taskId: string;
  initialTitle: string;
  projectId?: string | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [state, formAction, pending] = useActionState<UpdateTitleState | undefined, FormData>(
    updateTaskTitle,
    undefined,
  );

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  useEffect(() => {
    if (state?.ok) {
      if (state.title) setTitle(state.title);
      setEditing(false);
    }
  }, [state]);

  function startEdit() {
    setInputValue(title);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setInputValue("");
  }

  const trimmed = inputValue.trim();
  const unchanged = trimmed === title.trim();
  const errorMessage = state?.ok === false ? (state.message ?? TITLE_ERROR) : null;

  if (editing) {
    return (
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="taskId" value={taskId} />
        {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
        <input
          type="text"
          name="title"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          required
          disabled={pending}
          className={inputClassName}
        />
        {errorMessage ? <TaskFieldError message={errorMessage} /> : null}
        <TaskFieldEditActions
          pending={pending}
          saveDisabled={!trimmed || unchanged}
          onCancel={cancelEdit}
        />
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <h1 className="flex-1 text-3xl font-semibold md:text-4xl">{title}</h1>
      <TaskFieldEditTrigger onClick={startEdit} />
    </div>
  );
}
