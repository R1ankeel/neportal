const MAX_TEXT_LENGTH = 500;

function preview(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= MAX_TEXT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_TEXT_LENGTH)}…`;
}

export function buildTaskCommentUpdatedMessage(
  taskTitle: string,
  oldText: string,
  newText: string,
): string {
  return [
    `Комментарий к задаче «${taskTitle.trim() || "—"}» изменён.`,
    "",
    "Было:",
    preview(oldText),
    "",
    "Стало:",
    preview(newText),
  ].join("\n");
}
