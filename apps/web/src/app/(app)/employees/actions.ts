"use server";

import { revalidatePath } from "next/cache";
import { apiDeleteJson, apiPatchJson, apiPostJson } from "@/lib/api";
import { formatApiErrorMessage } from "@/lib/format-api-error";
import { normalizeTelegramUsername } from "@/lib/telegram-username";

export type EmployeeFormState = { ok: boolean; message?: string };

function mapError(e: unknown, fallback: string): string {
  if (e instanceof Error) return formatApiErrorMessage(e.message) || fallback;
  return fallback;
}

export async function createEmployee(
  _prev: EmployeeFormState | undefined,
  formData: FormData,
): Promise<EmployeeFormState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const telegramUsernameRaw = String(formData.get("telegramUsername") ?? "");

  if (!fullName) return { ok: false, message: "Укажите ФИО" };
  if (!role) return { ok: false, message: "Выберите роль" };

  const body: Record<string, string> = { fullName, role };
  const telegramUsername = normalizeTelegramUsername(telegramUsernameRaw);
  if (telegramUsername) {
    body.telegramUsername = telegramUsername;
  }

  try {
    await apiPostJson("/users", body);
    revalidatePath("/employees");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mapError(e, "Ошибка создания") };
  }
}

export async function updateEmployeeUsername(
  _prev: EmployeeFormState | undefined,
  formData: FormData,
): Promise<EmployeeFormState> {
  const userId = String(formData.get("userId") ?? "");
  const telegramUsernameRaw = String(formData.get("telegramUsername") ?? "");

  if (!userId) return { ok: false, message: "Не указан сотрудник" };

  const body: { telegramUsername: string | null } = {
    telegramUsername: normalizeTelegramUsername(telegramUsernameRaw),
  };

  try {
    await apiPatchJson(`/users/${userId}`, body);
    revalidatePath("/employees");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mapError(e, "Ошибка сохранения") };
  }
}

export async function unlinkEmployeeTelegram(
  userId: string,
): Promise<EmployeeFormState> {
  if (!userId) return { ok: false, message: "Не указан сотрудник" };

  try {
    await apiDeleteJson(`/users/${userId}/telegram`);
    revalidatePath("/employees");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mapError(e, "Ошибка отвязки") };
  }
}

export async function deleteEmployee(userId: string): Promise<EmployeeFormState> {
  if (!userId) return { ok: false, message: "Не указан сотрудник" };

  try {
    await apiDeleteJson(`/users/${userId}`);
    revalidatePath("/employees");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mapError(e, "Ошибка удаления") };
  }
}
