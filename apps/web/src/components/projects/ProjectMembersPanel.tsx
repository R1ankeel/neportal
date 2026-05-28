"use client";

import { useActionState } from "react";
import {
  addProjectMember,
  removeProjectMember,
  type ProjectFormState,
} from "@/app/(app)/projects/actions";
import type { ApiProjectMember, ApiUser } from "@/lib/types";

const projectRoleLabel: Record<string, string> = {
  MANAGER: "Менеджер",
  MEMBER: "Участник",
  VIEWER: "Наблюдатель",
};

function orgRoleLabel(role: string): string {
  const map: Record<string, string> = {
    OWNER: "Владелец",
    MANAGER: "Менеджер",
    ACCOUNTANT: "Бухгалтер",
    EMPLOYEE: "Сотрудник",
  };
  return map[role] ?? role;
}

export function ProjectMembersPanel({
  projectId,
  actorUserId,
  members,
  users,
  canManage,
}: {
  projectId: string;
  actorUserId: string;
  members: ApiProjectMember[];
  users: ApiUser[];
  canManage: boolean;
}) {
  const memberIds = new Set(members.map((m) => m.userId));
  const candidates = users.filter((u) => !memberIds.has(u.id));

  const [addState, addAction, addPending] = useActionState<ProjectFormState | undefined, FormData>(
    addProjectMember,
    undefined,
  );
  const [removeState, removeAction, removePending] = useActionState<
    ProjectFormState | undefined,
    FormData
  >(removeProjectMember, undefined);

  return (
    <div className="space-y-6">
      {addState?.ok === false && addState.message ? (
        <p className="rounded-lg bg-red-50 p-3 text-base text-red-800 dark:bg-red-950/40 dark:text-red-200">
          {addState.message}
        </p>
      ) : null}
      {addState?.ok === true ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-base text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          Участник добавлен
        </p>
      ) : null}
      {removeState?.ok === false && removeState.message ? (
        <p className="rounded-lg bg-red-50 p-3 text-base text-red-800 dark:bg-red-950/40 dark:text-red-200">
          {removeState.message}
        </p>
      ) : null}

      {canManage ? (
        <form action={addAction} className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <input type="hidden" name="actorUserId" value={actorUserId} />
          <input type="hidden" name="projectId" value={projectId} />
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Добавить сотрудника
            </span>
            <select
              name="userId"
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">Выберите…</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({orgRoleLabel(u.role)})
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={addPending || candidates.length === 0}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {addPending ? "…" : "Добавить"}
          </button>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-base">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300">
              <th className="px-4 py-3 font-semibold">Сотрудник</th>
              <th className="px-4 py-3 font-semibold">Роль в организации</th>
              <th className="px-4 py-3 font-semibold">Роль в проекте</th>
              {canManage ? <th className="px-4 py-3 font-semibold">Действия</th> : null}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 4 : 3} className="px-4 py-8 text-center text-zinc-500">
                  Участников пока нет
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-3 font-medium">{m.user.fullName}</td>
                  <td className="px-4 py-3">{orgRoleLabel(m.user.role)}</td>
                  <td className="px-4 py-3">{projectRoleLabel[m.role] ?? m.role}</td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <form action={removeAction}>
                        <input type="hidden" name="actorUserId" value={actorUserId} />
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <button
                          type="submit"
                          disabled={removePending}
                          className="text-base text-red-700 hover:underline disabled:opacity-50 dark:text-red-400"
                        >
                          Удалить
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
