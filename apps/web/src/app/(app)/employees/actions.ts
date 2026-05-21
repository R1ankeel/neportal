"use server";

import { revalidatePath } from "next/cache";
import { apiPatchJson, apiPostJson } from "@/lib/api";

export type EmployeeFormState = { ok: boolean; message?: string };

function normalizeTelegramUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export async function createEmployee(
  _prev: EmployeeFormState | undefined,
  formData: FormData,
): Promise<EmployeeFormState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const telegramUsernameRaw = String(formData.get("telegramUsername") ?? "").trim();

  if (!fullName) return { ok: false, message: "Укажите ФИО" };
  if (!role) return { ok: false, message: "Выберите роль" };

  const body: Record<string, string> = { fullName, role };
  if (telegramUsernameRaw) {
    body.telegramUsername = normalizeTelegramUsername(telegramUsernameRaw);
  }

  try {
    await apiPostJson("/users", body);
    revalidatePath("/employees");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Ошибка создания",
    };
  }
}

export async function updateEmployeeUsername(
  _prev: EmployeeFormState | undefined,
  formData: FormData,
): Promise<EmployeeFormState> {
  const userId = String(formData.get("userId") ?? "");
  const telegramUsernameRaw = String(formData.get("telegramUsername") ?? "").trim();

  if (!userId) return { ok: false, message: "Не указан сотрудник" };

  const body: { telegramUsername: string | null } = {
    telegramUsername: telegramUsernameRaw
      ? normalizeTelegramUsername(telegramUsernameRaw)
      : null,
  };

  try {
    await apiPatchJson(`/users/${userId}`, body);
    revalidatePath("/employees");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Ошибка сохранения",
    };
  }
}
