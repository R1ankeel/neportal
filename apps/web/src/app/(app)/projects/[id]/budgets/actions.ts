"use server";

import { revalidatePath } from "next/cache";
import { apiGet, apiPostJson } from "@/lib/api";
import type { ApiUser } from "@/lib/types";

export type BudgetFormState = { ok: boolean; message?: string };

function pickOwnerId(users: ApiUser[]): string | undefined {
  return users.find((u) => u.role === "OWNER")?.id ?? users[0]?.id;
}

export async function createProjectBudget(
  _prev: BudgetFormState | undefined,
  formData: FormData,
): Promise<BudgetFormState> {
  const projectId = String(formData.get("projectId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || undefined;
  const matchingKeywords = String(formData.get("matchingKeywords") ?? "").trim() || undefined;
  const amountRaw = formData.get("amount");
  const amount = typeof amountRaw === "string" ? Number(amountRaw) : Number(amountRaw);
  const requiresReceipt = formData.get("requiresReceipt") === "on";
  const accessUserIds = formData.getAll("accessUserIds").map(String).filter(Boolean);

  if (!projectId) return { ok: false, message: "Не указан проект" };
  if (!name) return { ok: false, message: "Укажите название" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Укажите сумму" };

  let users: ApiUser[];
  try {
    users = await apiGet<ApiUser[]>("/users");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ошибка загрузки сотрудников" };
  }

  const createdById = pickOwnerId(users);
  if (!createdById) return { ok: false, message: "Нет сотрудников для createdById" };

  try {
    await apiPostJson("/budgets", {
      projectId,
      name,
      description,
      matchingKeywords,
      amount,
      requiresReceipt,
      accessUserIds,
      createdById,
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ошибка создания бюджета" };
  }

  revalidatePath(`/projects/${projectId}/budgets`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/budgets");
  return { ok: true };
}

export async function archiveProjectBudget(
  _prev: BudgetFormState | undefined,
  formData: FormData,
): Promise<BudgetFormState> {
  const budgetId = String(formData.get("budgetId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const archiveReason = String(formData.get("archiveReason") ?? "").trim() || undefined;

  if (!budgetId) return { ok: false, message: "Не указан бюджет" };

  let users: ApiUser[];
  try {
    users = await apiGet<ApiUser[]>("/users");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ошибка" };
  }

  const archivedById = pickOwnerId(users);
  if (!archivedById) return { ok: false, message: "Нет пользователя для архивации" };

  try {
    await apiPostJson(`/budgets/${budgetId}/archive`, { archivedById, archiveReason });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ошибка архивации" };
  }

  if (projectId) {
    revalidatePath(`/projects/${projectId}/budgets`);
    revalidatePath(`/projects/${projectId}`);
  }
  revalidatePath(`/budgets/${budgetId}`);
  revalidatePath("/budgets");
  return { ok: true };
}
