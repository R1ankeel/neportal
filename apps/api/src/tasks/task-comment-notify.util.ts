export function buildTaskCommentUpdatedMessage(taskTitle: string): string {
  return [
    "Изменён комментарий к задаче",
    "",
    `Задача: ${taskTitle.trim() || "—"}`,
  ].join("\n");
}
