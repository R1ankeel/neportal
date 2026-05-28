import type { ApiProject } from "./api";
import { PROJECT_SELECTION_TRUNCATED_NOTE } from "./project-resolution";

export function formatProjectSelectionMessage(
  projects: ApiProject[],
  options?: { truncated?: boolean },
): string {
  const lines = ["Выберите проект:", ""];

  projects.forEach((project, index) => {
    lines.push(`${index + 1}. ${project.name}`);
  });

  lines.push("", "Выберите кнопкой ниже или отправьте номер проекта.");
  if (options?.truncated) {
    lines.push("", PROJECT_SELECTION_TRUNCATED_NOTE);
  }
  return lines.join("\n");
}
