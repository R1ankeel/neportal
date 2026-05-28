"use server";

import { revalidatePath } from "next/cache";
import { getApiBaseUrl } from "@/lib/api";
import {
  formatApiErrorMessage,
  type TaskFieldFail,
  type TaskFieldOk,
} from "@/app/(app)/tasks/[id]/task-edit/server";

export type UpdateNoteTextState = TaskFieldOk<{ text: string }> | TaskFieldFail;

export async function updateNoteText(
  _prev: UpdateNoteTextState | undefined,
  formData: FormData,
): Promise<UpdateNoteTextState> {
  const noteId = String(formData.get("noteId") ?? "");
  const actorUserId = String(formData.get("actorUserId") ?? "").trim();
  const revalidateProjectPathId = String(formData.get("revalidateProjectPathId") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();

  if (!noteId) return { ok: false, message: "Не указана заметка" };
  if (!actorUserId) return { ok: false, message: "Не указан пользователь" };
  if (!text) return { ok: false, message: "Текст заметки не может быть пустым" };

  const res = await fetch(`${getApiBaseUrl()}/notes/${noteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ actorUserId, text }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, message: formatApiErrorMessage(res.status, errText) };
  }

  const note = (await res.json()) as { text: string };

  if (revalidateProjectPathId) {
    revalidatePath(`/projects/${revalidateProjectPathId}/notes`);
    revalidatePath(`/projects/${revalidateProjectPathId}`);
  }
  revalidatePath(`/notes?actorUserId=${encodeURIComponent(actorUserId)}`);
  revalidatePath("/notes");

  return { ok: true, text: note.text };
}

