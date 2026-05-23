"use server";

import { revalidatePath } from "next/cache";
import { apiPatchJson, getApiBaseUrl } from "@/lib/api";

export type AddExpenseState = { ok: boolean; message?: string; saved?: boolean };

export type BudgetKeywordsState = { ok: boolean; message?: string };

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

export async function updateBudgetMatchingKeywords(
  _prev: BudgetKeywordsState | undefined,
  formData: FormData,
): Promise<BudgetKeywordsState> {
  const budgetId = String(formData.get("budgetId") ?? "");
  if (!budgetId) return { ok: false, message: "Не указан бюджет" };

  const raw = String(formData.get("matchingKeywords") ?? "").trim();
  const matchingKeywords = raw.length > 0 ? raw : null;

  try {
    await apiPatchJson(`/budgets/${budgetId}`, { matchingKeywords });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ошибка сохранения" };
  }

  revalidatePath(`/budgets/${budgetId}`);
  if (formData.get("projectId")) {
    revalidatePath(`/projects/${String(formData.get("projectId"))}/budgets`);
  }
  revalidatePath("/budgets");
  return { ok: true };
}
