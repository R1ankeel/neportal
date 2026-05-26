/**
 * Shared result shapes for task field server actions (useActionState).
 *
 * Pattern for new editors:
 * - Server action in ../actions.ts: validate → fetch API → revalidateTaskDetailPaths → return state
 * - Client *Editor.tsx: local display value, editing toggle, useActionState, TaskField* UI
 */

export type TaskFieldFail = { ok: false; message?: string };

export type TaskFieldOk<T extends Record<string, unknown> = Record<string, never>> = {
  ok: true;
} & T;

export type TaskFieldResult<T extends Record<string, unknown> = Record<string, never>> =
  | TaskFieldOk<T>
  | TaskFieldFail;
