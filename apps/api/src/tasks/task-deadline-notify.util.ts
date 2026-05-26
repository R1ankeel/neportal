/** Календарная дата UTC (YYYY-MM-DD) для сравнения дедлайнов. */
export function calendarDateKey(deadlineAt: Date | null | undefined): string | null {
  if (!deadlineAt) return null;
  const y = deadlineAt.getUTCFullYear();
  const m = String(deadlineAt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(deadlineAt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ISO date YYYY-MM-DD → DD.MM.YYYY */
export function formatDeadlineDateRu(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}

export function formatDeadlineAtRu(deadlineAt: Date | null | undefined): string {
  const key = calendarDateKey(deadlineAt);
  return key ? formatDeadlineDateRu(key) : "не указан";
}

export type DeadlineChangeKind = "set" | "changed" | "cleared";

export function deadlineChangeKind(
  oldKey: string | null,
  newKey: string | null,
): DeadlineChangeKind | null {
  if (oldKey === newKey) return null;
  if (!oldKey && newKey) return "set";
  if (oldKey && !newKey) return "cleared";
  return "changed";
}

export function buildTaskDeadlineChangedMessage(
  title: string,
  oldKey: string | null,
  newKey: string | null,
): string | null {
  const kind = deadlineChangeKind(oldKey, newKey);
  if (!kind) return null;

  const taskLine = `Задача: ${title.trim() || "—"}`;

  if (kind === "set" && newKey) {
    return [
      "📅 Установлен дедлайн задачи",
      "",
      taskLine,
      `Дедлайн: ${formatDeadlineDateRu(newKey)}`,
    ].join("\n");
  }

  if (kind === "cleared" && oldKey) {
    return [
      "📅 Дедлайн задачи удалён",
      "",
      taskLine,
      `Было: ${formatDeadlineDateRu(oldKey)}`,
    ].join("\n");
  }

  if (kind === "changed" && oldKey && newKey) {
    return [
      "📅 Изменён дедлайн задачи",
      "",
      taskLine,
      `Было: ${formatDeadlineDateRu(oldKey)}`,
      `Стало: ${formatDeadlineDateRu(newKey)}`,
    ].join("\n");
  }

  return null;
}
