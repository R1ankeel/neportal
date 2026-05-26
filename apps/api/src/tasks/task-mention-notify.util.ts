const MAX_TEXT_LENGTH = 500;

function preview(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= MAX_TEXT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_TEXT_LENGTH)}…`;
}

export function buildTaskMentionRequestedMessage(taskTitle: string, commentText: string): string {
  return [
    `📣 Вас упомянули в задаче «${taskTitle.trim() || "—"}»`,
    "",
    "Комментарий:",
    preview(commentText),
  ].join("\n");
}
