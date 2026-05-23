"use server";

import { revalidatePath } from "next/cache";
import { apiPostJson } from "@/lib/api";
import { formatApiErrorMessage } from "@/lib/format-api-error";

export type CancelAbsenceState = { ok: boolean; message?: string };

export async function cancelProjectAbsence(
  projectId: string,
  absenceId: string,
  cancelledById: string,
): Promise<CancelAbsenceState> {
  if (!projectId || !absenceId || !cancelledById) {
    return { ok: false, message: "Не указаны параметры отмены" };
  }

  try {
    await apiPostJson(`/absences/${absenceId}/cancel`, {
      cancelledById,
      cancellationReason: "Удалено через Web",
    });
    revalidatePath(`/projects/${projectId}/absences`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Ошибка отмены";
    return { ok: false, message: formatApiErrorMessage(raw) || "Ошибка отмены" };
  }
}
