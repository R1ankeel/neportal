"use client";

import { useActionState, useEffect, useState } from "react";
import { formatDateTime, noteSourceLabel } from "@/lib/format";
import type { ApiTaskComment } from "@/lib/types";
import {
  TaskFieldEditActions,
  TaskFieldEditTrigger,
  TaskFieldError,
  taskFieldErrorMessage,
} from "./task-edit";
import { updateTaskComment, type UpdateCommentState } from "./actions";

const COMMENT_ERROR = taskFieldErrorMessage("комментарий");

export function TaskCommentEditor({
  taskId,
  comment,
  projectId,
  editorId,
}: {
  taskId: string;
  comment: ApiTaskComment;
  projectId?: string | null;
  editorId?: string;
}) {
  const [text, setText] = useState(comment.text);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [state, formAction, pending] = useActionState<UpdateCommentState | undefined, FormData>(
    updateTaskComment,
    undefined,
  );

  useEffect(() => {
    setText(comment.text);
  }, [comment.text]);

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
  const errorMessage = state?.ok === false ? (state.message ?? COMMENT_ERROR) : null;

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-zinc-500">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{comment.author.fullName}</span>
        <span>{formatDateTime(comment.createdAt)}</span>
        <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">{noteSourceLabel(comment.source)}</span>
      </div>

      {editing ? (
        <form action={formAction} className="mt-2 space-y-2">
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="commentId" value={comment.id} />
          <input type="hidden" name="editorId" value={editorId ?? ""} />
          {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
          {comment.mentions?.map((m) => (
            <input key={m.id} type="hidden" name="mentionedUserIds" value={m.mentionedUser.id} />
          ))}
          <textarea
            name="text"
            rows={3}
            required
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={pending}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-950"
          />
          {errorMessage ? <TaskFieldError message={errorMessage} /> : null}
          <TaskFieldEditActions pending={pending} saveDisabled={!trimmed || unchanged} onCancel={cancelEdit} />
        </form>
      ) : (
        <>
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="whitespace-pre-wrap text-lg text-zinc-700 dark:text-zinc-300">{text}</p>
            {editorId ? <TaskFieldEditTrigger onClick={startEdit} /> : null}
          </div>
          {comment.mentions && comment.mentions.length > 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              Упомянуты: {comment.mentions.map((m) => m.mentionedUser.fullName).join(", ")}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}
