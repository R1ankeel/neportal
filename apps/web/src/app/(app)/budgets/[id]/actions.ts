"use server";

import { revalidatePath } from "next/cache";
import { getApiBaseUrl } from "@/lib/api";

export type AddExpenseState = { ok: boolean; message?: string; saved?: boolean };
export type UploadReceiptState = { ok: boolean; message?: string };

function pickUploaderId(users: { id: string; role: string }[]): string | undefined {
  return users.find((u) => u.role === "OWNER")?.id ?? users[0]?.id;
}

export async function addBudgetExpense(
  _prev: AddExpenseState | undefined,
  formData: FormData,
): Promise<AddExpenseState> {
  const budgetId = String(formData.get("budgetId") ?? "");
  if (!budgetId) {
    return { ok: false, message: "Не указан бюджет" };
  }

  const userId = String(formData.get("userId") ?? "");
  const amountRaw = formData.get("amount");
  const amount = typeof amountRaw === "string" ? Number(amountRaw) : Number(amountRaw);
  const expenseDateRaw = String(formData.get("expenseDate") ?? "");
  const description = String(formData.get("description") ?? "").trim() || undefined;

  if (!userId) return { ok: false, message: "Выберите сотрудника" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Укажите сумму" };
  if (!expenseDateRaw) return { ok: false, message: "Укажите дату" };

  const expenseDate = new Date(expenseDateRaw);
  if (Number.isNaN(expenseDate.getTime())) {
    return { ok: false, message: "Некорректная дата" };
  }

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/budgets/${budgetId}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      userId,
      amount,
      currency: "RUB",
      description,
      expenseDate: expenseDate.toISOString(),
      source: "WEB",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, message: text || `Ошибка ${res.status}` };
  }

  const data = (await res.json()) as { budget?: { project?: { id: string } | null } };

  revalidatePath(`/budgets/${budgetId}`);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  if (data.budget?.project?.id) {
    revalidatePath(`/projects/${data.budget.project.id}/budgets`);
    revalidatePath(`/projects/${data.budget.project.id}`);
  }
  return { ok: true, saved: true };
}

export async function uploadExpenseReceipt(
  _prev: UploadReceiptState | undefined,
  formData: FormData,
): Promise<UploadReceiptState> {
  const expenseId = String(formData.get("expenseId") ?? "");
  const budgetId = String(formData.get("budgetId") ?? "");
  let uploadedById = String(formData.get("uploadedById") ?? "");

  if (!expenseId) return { ok: false, message: "Не указан расход" };
  if (!budgetId) return { ok: false, message: "Не указан бюджет" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Выберите файл" };
  }

  if (!uploadedById) {
    const { apiGet } = await import("@/lib/api");
    const users = await apiGet<{ id: string; role: string }[]>("/users");
    uploadedById = pickUploaderId(users) ?? "";
  }
  if (!uploadedById) return { ok: false, message: "Не указан загрузивший" };

  const body = new FormData();
  body.append("file", file);
  body.append("uploadedById", uploadedById);

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/budget-expenses/${expenseId}/receipt`, {
    method: "POST",
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, message: text || `Ошибка ${res.status}` };
  }

  revalidatePath(`/budgets/${budgetId}`);
  revalidatePath("/budgets");
  revalidatePath("/dashboard");

  return { ok: true };
}
