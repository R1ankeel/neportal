import type { ApiAbsenceAffectedTask } from "./api";
import { formatTaskDeadline } from "./task-notifications";
import type {
  AbsenceDelegationAssignment,
  AbsenceDelegationTaskItem,
} from "./pending-absence-delegation";
export function absenceTypeLabelRu(type: "SICK_LEAVE" | "VACATION"): string {
  return type === "SICK_LEAVE" ? "больничный" : "отпуск";
}

export function taskStatusLabelRu(status: string): string {
  switch (status) {
    case "NEW":
      return "Новая";
    case "IN_PROGRESS":
      return "В работе";
    case "DONE":
      return "Выполнена";
    case "CANCELLED":
      return "Отменена";
    default:
      return status;
  }
}

export function toAbsenceDelegationTasks(
  tasks: ApiAbsenceAffectedTask[],
): AbsenceDelegationTaskItem[] {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    deadlineAt: t.deadlineAt,
    status: t.status,
    projectName: t.project?.name ?? null,
    creatorId: t.creator.id,
    creatorName: t.creator.fullName,
  }));
}

export function formatAbsenceDelegationTaskList(tasks: AbsenceDelegationTaskItem[]): string {
  const showProject = new Set(tasks.map((t) => t.projectName ?? "")).size > 1;

  return tasks
    .map((t, i) => {
      const lines = [
        `${i + 1}. ${t.title}`,
        ...(showProject && t.projectName ? [`   Проект: ${t.projectName}`] : []),
        `   Дедлайн: ${formatTaskDeadline(t.deadlineAt)}`,
        `   Статус: ${taskStatusLabelRu(t.status)}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

export function formatAbsenceImpactIntroMessage(
  type: "SICK_LEAVE" | "VACATION",
  tasks: AbsenceDelegationTaskItem[],
): string {
  const typeLabel = absenceTypeLabelRu(type);
  const count = tasks.length;
  return [
    `У вас на период ${typeLabel} ${count} ${taskCountWord(count)}:`,
    "",
    formatAbsenceDelegationTaskList(tasks),
    "",
    "Хотите оставить задачи за собой или перераспределить?",
    "Ответьте: оставить / распределить",
  ].join("\n");
}

export function formatItemAssigneeQuestion(
  task: AbsenceDelegationTaskItem,
  index: number,
  total: number,
): string {
  return [
    `Задача ${index + 1} из ${total}:`,
    `«${task.title}»`,
    `Дедлайн: ${formatTaskDeadline(task.deadlineAt)}`,
    "",
    "Кому назначить?",
    "Напишите «мне» / «оставить» или имя сотрудника.",
  ].join("\n");
}

export function formatDistributionSummary(
  tasks: AbsenceDelegationTaskItem[],
  assignments: AbsenceDelegationAssignment[],
): string {
  const lines = tasks.map((task, i) => {
    const a = assignments.find((x) => x.taskId === task.id);
    if (!a || a.action === "KEEP") {
      return `${i + 1}. ${task.title} → оставить за собой`;
    }
    return `${i + 1}. ${task.title} → ${a.toUserName ?? "сотрудник"}`;
  });

  return [
    "Проверьте распределение задач:",
    "",
    ...lines,
    "",
    "Подтвердить?",
    "Ответьте: да / нет",
  ].join("\n");
}

export function buildDistributionResultMessage(
  statuses: Array<{ status: "PENDING" | "ACCEPTED" }>,
): string {
  const transferCount = statuses.length;
  if (transferCount === 0) {
    return "Ок, задачи остаются за вами.";
  }

  const pendingCount = statuses.filter((s) => s.status === "PENDING").length;
  const acceptedCount = statuses.filter((s) => s.status === "ACCEPTED").length;

  if (pendingCount === transferCount) {
    return `Запросы на передачу ${transferCount} ${taskCountWord(transferCount)} отправлены.`;
  }
  if (acceptedCount === transferCount) {
    return `${transferCount} ${taskCountWord(transferCount)} переданы новым исполнителям.`;
  }
  return `Готово: ${acceptedCount} ${taskCountWord(acceptedCount)} переданы, ${pendingCount} ${requestWord(pendingCount)} отправлены.`;
}

function taskCountWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "задача";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "задачи";
  return "задач";
}

function requestWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запрос";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "запроса";
  return "запросов";
}
