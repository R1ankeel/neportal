import type { ApiBudget } from "./types";

export function parseAmount(value: string | number | undefined | null): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: currency || "RUB",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function budgetRemainder(b: ApiBudget): number {
  return parseAmount(b.initialAmount) - parseAmount(b.spentAmount);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const taskStatusRu: Record<string, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  DONE: "Готово",
  CANCELLED: "Отменена",
};

export function taskStatusLabel(status: string): string {
  return taskStatusRu[status] ?? status;
}

const noteSourceRu: Record<string, string> = {
  WEB: "Web",
  TELEGRAM_TEXT: "Telegram",
  TELEGRAM_VOICE: "Голос Telegram",
};

export function noteSourceLabel(source: string): string {
  return noteSourceRu[source] ?? source;
}

export function expenseSourceLabel(source: string): string {
  return noteSourceRu[source] ?? source;
}

const expenseStatusRu: Record<string, string> = {
  PENDING: "На согласовании",
  APPROVED: "Одобрен",
  REJECTED: "Отклонён",
  CANCELLED: "Отменён",
};

export function expenseStatusLabel(status: string): string {
  return expenseStatusRu[status] ?? status;
}
