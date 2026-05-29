"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiPatchJson } from "@/lib/api";
import type { ApiProject } from "@/lib/types";

export async function archiveProject(formData: FormData): Promise<void> {
  const actorUserId = String(formData.get("actorUserId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!actorUserId || !projectId) {
    throw new Error("Некорректные данные");
  }

  try {
    await apiPatchJson<ApiProject>(
      `/projects/${encodeURIComponent(projectId)}/archive?actorUserId=${encodeURIComponent(actorUserId)}`,
      {},
    );
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Ошибка");
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?actorUserId=${encodeURIComponent(actorUserId)}`);
}

export async function restoreProject(formData: FormData): Promise<void> {
  const actorUserId = String(formData.get("actorUserId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!actorUserId || !projectId) {
    throw new Error("Некорректные данные");
  }

  try {
    await apiPatchJson<ApiProject>(
      `/projects/${encodeURIComponent(projectId)}/restore?actorUserId=${encodeURIComponent(actorUserId)}`,
      {},
    );
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Ошибка");
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?actorUserId=${encodeURIComponent(actorUserId)}`);
}

