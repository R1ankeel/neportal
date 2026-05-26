"use server";

import { revalidatePath } from "next/cache";
import { getApiBaseUrl } from "@/lib/api";

export type AddCommentState = { ok: boolean; message?: string; saved?: boolean };

export async function addTaskComment(
  _prev: AddCommentState | undefined,
  formData: FormData,
): Promise<AddCommentState> {
  const taskId = String(formData.get("taskId") ?? "");
  const authorId = String(formData.get("authorId") ?? "");
  const text = String(formData.get("text") ?? "").trim();

  if (!taskId) return { ok: false, message: "Не указана задача" };
  if (!authorId) return { ok: false, message: "Не указан автор" };
  if (!text) return { ok: false, message: "Введите текст комментария" };

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ authorId, text, source: "WEB" }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, message: errText || `Ошибка ${res.status}` };
  }

  const projectId = String(formData.get("projectId") ?? "").trim();

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  if (projectId) {
    revalidatePath(`/projects/${projectId}/tasks`);
    revalidatePath(`/projects/${projectId}`);
  }

  return { ok: true, saved: true };
}

export type UpdateDeadlineState =
  | { ok: true; deadlineAt: string | null }
  | { ok: false };

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

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  if (projectId) {
    revalidatePath(`/projects/${projectId}/tasks`);
    revalidatePath(`/projects/${projectId}`);
  }

  return { ok: true, deadlineAt: task.deadlineAt };
}
