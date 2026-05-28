"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiDeleteJson, apiPostJson } from "@/lib/api";
import type { ApiProject, ApiProjectMember } from "@/lib/types";

export type ProjectFormState =
  | { ok: true; projectId?: string }
  | { ok: false; message: string };

export async function createProject(
  _prev: ProjectFormState | undefined,
  formData: FormData,
): Promise<ProjectFormState> {
  const actorUserId = String(formData.get("actorUserId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || undefined;

  if (!actorUserId) return { ok: false, message: "Не указан пользователь (actorUserId)" };
  if (!name) return { ok: false, message: "Укажите название проекта" };

  let project: ApiProject;
  try {
    project = await apiPostJson<ApiProject>(
      `/projects?actorUserId=${encodeURIComponent(actorUserId)}`,
      { name, description },
    );
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ошибка создания проекта" };
  }

  revalidatePath("/projects");
  redirect(`/projects/${project.id}?actorUserId=${encodeURIComponent(actorUserId)}`);
}

export async function addProjectMember(
  _prev: ProjectFormState | undefined,
  formData: FormData,
): Promise<ProjectFormState> {
  const actorUserId = String(formData.get("actorUserId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();

  if (!actorUserId || !projectId || !userId) {
    return { ok: false, message: "Заполните все поля" };
  }

  try {
    await apiPostJson<ApiProjectMember>(
      `/projects/${projectId}/members?actorUserId=${encodeURIComponent(actorUserId)}`,
      { userId },
    );
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ошибка добавления участника" };
  }

  revalidatePath(`/projects/${projectId}/members`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true };
}

export async function removeProjectMember(
  _prev: ProjectFormState | undefined,
  formData: FormData,
): Promise<ProjectFormState> {
  const actorUserId = String(formData.get("actorUserId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();

  if (!actorUserId || !projectId || !userId) {
    return { ok: false, message: "Не указаны параметры" };
  }

  try {
    await apiDeleteJson(
      `/projects/${projectId}/members/${userId}?actorUserId=${encodeURIComponent(actorUserId)}`,
    );
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ошибка удаления участника" };
  }

  revalidatePath(`/projects/${projectId}/members`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true };
}
