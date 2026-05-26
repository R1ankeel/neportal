export function buildTaskMentionRequestedMessage(taskTitle: string, commentText: string): string {
  return [
    "Вас упомянули в задаче",
    "",
    `Задача: ${taskTitle.trim() || "—"}`,
    `Комментарий: ${commentText.trim() || "—"}`,
  ].join("\n");
}
