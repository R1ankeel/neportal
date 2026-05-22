"use server";

import { revalidatePath } from "next/cache";
import { getApiBaseUrl } from "@/lib/api";

export async function updateTaskStatus(_prev: unknown, formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!taskId || !status || !projectId) {
    return { ok: false as const, message: "Некорректные данные" };
  }

  const res = await fetch(`${getApiBaseUrl()}/tasks/${taskId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false as const, message: text || `Ошибка ${res.status}` };
  }

  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true as const };
}
