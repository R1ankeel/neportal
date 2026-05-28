import type { ApiAbsence, ApiAbsenceAffectedTask } from "./api";
import { absenceTypeLabelRu, taskStatusLabelRu } from "./absence-delegation-format";
import { formatIsoDateRu } from "./parse-ru-date";
import { formatTaskDeadline } from "./task-notifications";

export function groupAffectedTasksByProject(
  tasks: ApiAbsenceAffectedTask[],
): { name: string; tasks: ApiAbsenceAffectedTask[] }[] {
  const byKey = new Map<string, { name: string; tasks: ApiAbsenceAffectedTask[] }>();
  for (const task of tasks) {
    const key = task.project?.id ?? "";
    const name = task.project?.name ?? "—";
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.tasks.push(task);
    } else {
      byKey.set(key, { name, tasks: [task] });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ru", { sensitivity: "base" }),
  );
}

export function formatAffectedTasksGroupedSection(
  tasks: ApiAbsenceAffectedTask[],
  options: { tasksHeader: string; truncated?: boolean },
): string {
  if (tasks.length === 0) return "";

  const lines: string[] = [options.tasksHeader, ""];
  const sections = groupAffectedTasksByProject(tasks);

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex]!;
    lines.push(`Проект: ${section.name}`, "");
    section.tasks.forEach((task, index) => {
      lines.push(
        `${index + 1}. ${task.title}`,
        `   Дедлайн: ${formatTaskDeadline(task.deadlineAt)}`,
        `   Статус: ${taskStatusLabelRu(task.status)}`,
      );
      if (index < section.tasks.length - 1) {
        lines.push("");
      }
    });
    if (sectionIndex < sections.length - 1) {
      lines.push("", "");
    }
  }

  if (options.truncated) {
    lines.push("", "Показаны ближайшие 20 задач.");
  }

  return lines.join("\n");
}

export function formatCreateAbsenceSummaryMessage(
  absence: ApiAbsence,
  options: { forSelf: boolean; employeeName: string },
): string {
  const typeLabel = absence.type === "SICK_LEAVE" ? "Больничный" : "Отпуск";
  const startRu = formatIsoDateRu(absence.startDate);
  const endRu = formatIsoDateRu(absence.endDate);

  const summaryLines: string[] = [];
  if (options.forSelf) {
    summaryLines.push(`${typeLabel} добавлен: с ${startRu} по ${endRu}.`);
  } else {
    summaryLines.push(
      `${typeLabel} добавлен для ${options.employeeName}: с ${startRu} по ${endRu}.`,
    );
  }
  if (absence.type === "SICK_LEAVE" && absence.documentNumber) {
    summaryLines.push(`Номер: ${absence.documentNumber}.`);
  }

  const tasks = absence.affectedTasks ?? [];
  const absenceKind = absenceTypeLabelRu(absence.type);

  if (tasks.length > 0) {
    const tasksBlock = formatAffectedTasksGroupedSection(tasks, {
      tasksHeader: `Задачи на период ${absenceKind}:`,
      truncated: absence.affectedTasksTruncated,
    });
    return [...summaryLines, "", tasksBlock].join("\n");
  }

  if ((absence.membershipProjectCount ?? 0) === 0) {
    summaryLines.push(
      "",
      options.forSelf
        ? "Отсутствие сохранено. Вы не состоите ни в одном проекте — затронутых задач нет."
        : `${options.employeeName} не состоит ни в одном проекте — затронутых задач нет.`,
    );
    return summaryLines.join("\n");
  }

  summaryLines.push(
    "",
    options.forSelf
      ? "На период отсутствия нет активных задач с дедлайном в ваших проектах."
      : `На период отсутствия у ${options.employeeName} нет активных задач с дедлайном в проектах участия.`,
  );
  return summaryLines.join("\n");
}

export function formatAbsenceDelegationIntroShort(taskCount: number): string {
  const word =
    taskCount === 1
      ? "задача"
      : taskCount >= 2 && taskCount <= 4
        ? "задачи"
        : "задач";
  return [
    `У вас ${taskCount} ${word} на период отсутствия.`,
    "",
    "Хотите оставить задачи за собой или перераспределить?",
    "Ответьте: оставить / распределить",
  ].join("\n");
}
