"use client";

import { useActionState, useEffect, useState } from "react";
import { formatDateTime, noteSourceLabel } from "@/lib/format";
import type { ApiNote } from "@/lib/types";
import {
  TaskFieldEditActions,
  TaskFieldEditTrigger,
  TaskFieldError,
  taskFieldErrorMessage,
} from "@/app/(app)/tasks/[id]/task-edit";
import { updateNoteText, type UpdateNoteTextState } from "./actions";

const NOTE_ERROR = taskFieldErrorMessage("заметку");

const textareaClassName =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-lg leading-relaxed dark:border-zinc-600 dark:bg-zinc-950";

export function NoteTextEditor({
  note,
  actorUserId,
  revalidateProjectPathId,
  compactMeta = false,
}: {
  note: ApiNote;
  actorUserId: string;
  revalidateProjectPathId?: string;
  compactMeta?: boolean;
}) {
  const [text, setText] = useState(note.text);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [state, formAction, pending] = useActionState<UpdateNoteTextState | undefined, FormData>(
    updateNoteText,
    undefined,
  );

  useEffect(() => {
    setText(note.text);
  }, [note.text]);

  useEffect(() => {
    if (state?.ok) {
      setText(state.text);
      setEditing(false);
    }
  }, [state]);

  function startEdit() {
    setInputValue(text);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setInputValue("");
  }

  const trimmed = inputValue.trim();
  const unchanged = trimmed === text.trim();
  const errorMessage = state?.ok === false ? (state.message ?? NOTE_ERROR) : null;

  if (editing) {
    return (
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="noteId" value={note.id} />
        <input type="hidden" name="actorUserId" value={actorUserId} />
        <input type="hidden" name="revalidateProjectPathId" value={revalidateProjectPathId ?? ""} />
        <textarea
          name="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          rows={compactMeta ? 3 : 5}
          required
          disabled={pending}
          className={textareaClassName}
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
    <>
      <div className="flex flex-wrap items-start gap-2">
        <p className="min-w-0 flex-1 text-lg leading-relaxed">{text}</p>
        <TaskFieldEditTrigger onClick={startEdit} />
      </div>
      <dl
        className={`flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400 ${compactMeta ? "mt-2" : "mt-3"}`}
      >
        <div>
          <dt className="sr-only">Автор</dt>
          <dd>{note.creator?.fullName ?? "—"}</dd>
        </div>
        <div>
          <dt className="sr-only">Источник</dt>
          <dd>{noteSourceLabel(note.source)}</dd>
        </div>
        <div>
          <dt className="sr-only">Дата</dt>
          <dd>{formatDateTime(note.createdAt)}</dd>
        </div>
      </dl>
    </>
  );
}

