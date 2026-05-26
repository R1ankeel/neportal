"use server";

import { getApiBaseUrl } from "@/lib/api";
import {
  formatApiErrorMessage,
  revalidateTaskDetailPaths,
  type TaskFieldFail,
  type TaskFieldOk,
} from "./task-edit/server";

export type AddCommentState = { ok: boolean; message?: string; saved?: boolean };

export async function addTaskComment(
  _prev: AddCommentState | undefined,
  formData: FormData,
): Promise<AddCommentState> {
  const taskId = String(formData.get("taskId") ?? "");
  const authorId = String(formData.get("authorId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const mentionedUserIdRaw = String(formData.get("mentionedUserId") ?? "").trim();
  const mentionedUserId = mentionedUserIdRaw === authorId ? "" : mentionedUserIdRaw;

  if (!taskId) return { ok: false, message: "Не указана задача" };
  if (!authorId) return { ok: false, message: "Не указан автор" };
  if (!text) return { ok: false, message: "Введите текст комментария" };

  const base = getApiBaseUrl();
  const path = mentionedUserId ? `/tasks/${taskId}/comments/mention` : `/tasks/${taskId}/comments`;
  const payload = mentionedUserId
    ? { authorId, mentionedUserId, text, source: "WEB", notifyMentioned: true }
    : { authorId, text, source: "WEB" };
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, message: formatApiErrorMessage(res.status, errText) };
  }

  const projectId = String(formData.get("projectId") ?? "").trim();

  revalidateTaskDetailPaths(taskId, projectId);

  return { ok: true, saved: true };
}

export type UpdateCommentState = TaskFieldOk<{ text: string }> | TaskFieldFail;

export async function updateTaskComment(
  _prev: UpdateCommentState | undefined,
  formData: FormData,
): Promise<UpdateCommentState> {
  const taskId = String(formData.get("taskId") ?? "");
  const commentId = String(formData.get("commentId") ?? "");
  const editorId = String(formData.get("editorId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();

  if (!taskId) return { ok: false, message: "Не указана задача" };
  if (!commentId) return { ok: false, message: "Не указан комментарий" };
  if (!editorId) return { ok: false, message: "Не указан пользователь" };
  if (!text) return { ok: false, message: "Введите текст комментария" };

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}/comments/${commentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ editorId, text }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, message: formatApiErrorMessage(res.status, errText) };
  }

  const comment = (await res.json()) as { text: string };

  revalidateTaskDetailPaths(taskId, projectId);

  return { ok: true, text: comment.text };
}

export type UpdateDeadlineState = TaskFieldOk<{ deadlineAt: string | null }> | TaskFieldFail;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateTaskDeadline(
  _prev: UpdateDeadlineState | undefined,
  formData: FormData,
): Promise<UpdateDeadlineState> {
  const taskId = String(formData.get("taskId") ?? "");
  const deadlineAt = String(formData.get("deadlineAt") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();

  if (!taskId || !deadlineAt || !ISO_DATE_RE.test(deadlineAt)) {
    return { ok: false };
  }

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}/deadline`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ deadlineAt, notifyAssignee: true }),
  });

  if (!res.ok) {
    return { ok: false };
  }

  const task = (await res.json()) as { deadlineAt: string | null };

  revalidateTaskDetailPaths(taskId, projectId);

  return { ok: true, deadlineAt: task.deadlineAt };
}

export type UpdateAssigneeState =
  | TaskFieldOk<{ assigneeId: string | null; assigneeName: string | null }>
  | TaskFieldFail;

export async function updateTaskAssignee(
  _prev: UpdateAssigneeState | undefined,
  formData: FormData,
): Promise<UpdateAssigneeState> {
  const taskId = String(formData.get("taskId") ?? "");
  const assigneeUserId = String(formData.get("assigneeUserId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!taskId) return { ok: false, message: "Не указана задача" };
  if (!assigneeUserId) return { ok: false, message: "Выберите исполнителя" };

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}/assignee`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ assigneeUserId }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, message: formatApiErrorMessage(res.status, errText) };
  }

  const task = (await res.json()) as {
    assignee?: { id: string; fullName: string } | null;
  };

  revalidateTaskDetailPaths(taskId, projectId);

  return {
    ok: true,
    assigneeId: task.assignee?.id ?? null,
    assigneeName: task.assignee?.fullName ?? null,
  };
}

export type UpdateTitleState = TaskFieldOk<{ title: string }> | TaskFieldFail;

export async function updateTaskTitle(
  _prev: UpdateTitleState | undefined,
  formData: FormData,
): Promise<UpdateTitleState> {
  const taskId = String(formData.get("taskId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();

  if (!taskId) return { ok: false, message: "Не указана задача" };
  if (!title) return { ok: false, message: "Название не может быть пустым" };

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, message: formatApiErrorMessage(res.status, errText) };
  }

  const task = (await res.json()) as { title: string };

  revalidateTaskDetailPaths(taskId, projectId);

  return { ok: true, title: task.title };
}

export type UpdateDescriptionState = TaskFieldOk<{ description: string | null }> | TaskFieldFail;

export async function updateTaskDescription(
  _prev: UpdateDescriptionState | undefined,
  formData: FormData,
): Promise<UpdateDescriptionState> {
  const taskId = String(formData.get("taskId") ?? "");
  const projectId = String(formData.get("projectId") ?? "").trim();
  const descriptionRaw = formData.get("description");
  const description =
    descriptionRaw == null ? null : String(descriptionRaw).trim() || null;

  if (!taskId) return { ok: false, message: "Не указана задача" };

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ description }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, message: formatApiErrorMessage(res.status, errText) };
  }

  const task = (await res.json()) as { description: string | null };

  revalidateTaskDetailPaths(taskId, projectId);

  return { ok: true, description: task.description };
}
