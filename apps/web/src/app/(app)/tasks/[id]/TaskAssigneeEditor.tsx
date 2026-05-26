"use client";

import { useActionState, useEffect, useState } from "react";
import type { ApiTaskUser, ApiUser } from "@/lib/types";
import { updateTaskAssignee, type UpdateAssigneeState } from "./actions";
import {
  TaskFieldEditActions,
  TaskFieldEditTrigger,
  TaskFieldError,
  taskFieldErrorMessage,
} from "./task-edit";

const ASSIGNEE_ERROR = taskFieldErrorMessage("исполнителя");

function assigneeLabel(assigneeId: string | null, assigneeName: string | null, users: ApiUser[]): string {
  if (!assigneeId) return "Не назначен";
  if (assigneeName) return assigneeName;
  return users.find((u) => u.id === assigneeId)?.fullName ?? "—";
}

export function TaskAssigneeEditor({
  taskId,
  initialAssignee,
  users,
  projectId,
}: {
  taskId: string;
  initialAssignee: ApiTaskUser | null;
  users: ApiUser[];
  projectId?: string | null;
}) {
  const [assigneeId, setAssigneeId] = useState<string | null>(initialAssignee?.id ?? null);
  const [assigneeName, setAssigneeName] = useState<string | null>(initialAssignee?.fullName ?? null);
  const [editing, setEditing] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [state, formAction, pending] = useActionState<UpdateAssigneeState | undefined, FormData>(
    updateTaskAssignee,
    undefined,
  );

  useEffect(() => {
    setAssigneeId(initialAssignee?.id ?? null);
    setAssigneeName(initialAssignee?.fullName ?? null);
  }, [initialAssignee?.id, initialAssignee?.fullName]);

  useEffect(() => {
    if (state?.ok) {
      if (state.assigneeId != null) setAssigneeId(state.assigneeId);
      if (state.assigneeName != null) setAssigneeName(state.assigneeName);
      setEditing(false);
    }
  }, [state]);

  function startEdit() {
    setSelectedUserId(assigneeId ?? users[0]?.id ?? "");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSelectedUserId("");
  }

  const unchanged = selectedUserId === (assigneeId ?? "");
  const errorMessage = state?.ok === false ? (state.message ?? ASSIGNEE_ERROR) : null;

  if (editing) {
    return (
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="taskId" value={taskId} />
        {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
        <select
          name="assigneeUserId"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          required
          disabled={pending || users.length === 0}
          className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-600 dark:bg-zinc-950"
        >
          <option value="" disabled>
            Выберите сотрудника…
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
        {users.length === 0 ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">Нет сотрудников в организации</p>
        ) : null}
        {errorMessage ? <TaskFieldError message={errorMessage} /> : null}
        <TaskFieldEditActions
          pending={pending}
          saveDisabled={!selectedUserId || unchanged}
          onCancel={cancelEdit}
        />
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-lg">{assigneeLabel(assigneeId, assigneeName, users)}</span>
      {users.length > 0 ? <TaskFieldEditTrigger onClick={startEdit} /> : null}
    </div>
  );
}
