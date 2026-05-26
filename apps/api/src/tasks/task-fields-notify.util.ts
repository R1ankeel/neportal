export function normalizeTaskDescription(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function taskDescriptionsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeTaskDescription(a) === normalizeTaskDescription(b);
}

export function buildTaskFieldsUpdatedNotifyMessage(params: {
  taskTitle: string;
  titleChanged: boolean;
  descriptionChanged: boolean;
  oldTitle?: string;
  newTitle?: string;
}): string | null {
  const { taskTitle, titleChanged, descriptionChanged, oldTitle, newTitle } = params;
  if (!titleChanged && !descriptionChanged) return null;

  if (titleChanged && descriptionChanged) {
    return [
      "Задача обновлена",
      "",
      `Задача: ${taskTitle.trim() || "—"}`,
      "Изменено: название, описание",
    ].join("\n");
  }

  if (titleChanged) {
    return [
      "Изменено название задачи",
      "",
      `Было: ${(oldTitle ?? "").trim() || "—"}`,
      `Стало: ${(newTitle ?? "").trim() || "—"}`,
    ].join("\n");
  }

  return [
    "Изменено описание задачи",
    "",
    `Задача: ${taskTitle.trim() || "—"}`,
  ].join("\n");
}
