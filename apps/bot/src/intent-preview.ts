import type { ResolvedIntent } from "./intent-resolver";
import { formatIsoDateRu } from "./parse-ru-date";
import { formatMoney } from "./api";
import { transferPreviewNote } from "./task-transfer-flow";

const CONFIRM_FOOTER = "\n\nОтветьте: да / нет";

export function buildIntentPreview(resolved: ResolvedIntent): string {
  switch (resolved.intent) {
    case "create_task": {
      const lines = ["Создать задачу?", `Проект: ${resolved.project.name}`];
      if (resolved.assignee) {
        lines.push(`Исполнитель: ${resolved.assignee.fullName}`);
      }
      if (resolved.deadlineDate) {
        lines.push(`Дедлайн: ${formatIsoDateRu(resolved.deadlineDate)}`);
      }
      lines.push(`Задача: ${resolved.title}`);
      if (resolved.description) {
        lines.push(`Описание: ${resolved.description}`);
      }
      return lines.join("\n") + CONFIRM_FOOTER;
    }

    case "create_note":
      return [
        `Создать заметку в проекте «${resolved.project.name}»?`,
        `Текст: ${resolved.text}`,
      ].join("\n") + CONFIRM_FOOTER;

    case "create_expense":
      return [
        "Создать расход?",
        `Проект: ${resolved.project.name}`,
        `Бюджет: ${resolved.budget.title}`,
        `Сумма: ${formatMoney(resolved.amount, resolved.budget.currency)}`,
        resolved.description ? `Описание: ${resolved.description}` : null,
      ]
        .filter((line): line is string => line != null)
        .join("\n") + CONFIRM_FOOTER;

    case "create_absence": {
      const typeLabel = resolved.type === "SICK_LEAVE" ? "больничный" : "отпуск";
      const lines = [
        `Добавить ${typeLabel}?`,
        `Сотрудник: ${resolved.user.fullName}`,
        `Период: ${formatIsoDateRu(resolved.startDate)} — ${formatIsoDateRu(resolved.endDate)}`,
      ];
      if (resolved.documentNumber) {
        lines.push(`Номер: ${resolved.documentNumber}`);
      }
      return lines.join("\n") + CONFIRM_FOOTER;
    }

    case "cancel_absence": {
      const typeLabel = resolved.type === "SICK_LEAVE" ? "больничный" : "отпуск";
      const lines = [
        `Удалить ${typeLabel} ${resolved.absenceUserName} с ${formatIsoDateRu(resolved.startDate)} по ${formatIsoDateRu(resolved.endDate)}?`,
      ];
      if (resolved.cancellationReason) {
        lines.push(`Причина: ${resolved.cancellationReason}`);
      }
      return lines.join("\n") + CONFIRM_FOOTER;
    }

    case "set_task_deadline":
      return [
        "Установить дедлайн задачи?",
        resolved.projectName ? `Проект: ${resolved.projectName}` : null,
        `Задача: ${resolved.taskTitle}`,
        `Дедлайн: ${formatIsoDateRu(resolved.deadlineDate)}`,
      ]
        .filter((line): line is string => line != null)
        .join("\n") + CONFIRM_FOOTER;

    case "complete_task": {
      const lines = [`Закрыть задачу «${resolved.taskTitle}»?`];
      if (resolved.completionResult) {
        lines.push("", `Результат: ${resolved.completionResult}`);
      }
      return lines.join("\n") + CONFIRM_FOOTER;
    }

    case "cancel_task": {
      const lines = [`Отменить задачу «${resolved.taskTitle}»?`];
      if (resolved.cancellationReason) {
        lines.push("", `Причина отмены: ${resolved.cancellationReason}`);
      }
      return lines.join("\n") + CONFIRM_FOOTER;
    }

    case "start_task":
      return `Взять задачу «${resolved.taskTitle}» в работу?` + CONFIRM_FOOTER;

    case "add_task_comment":
      return [
        `Добавить комментарий к задаче «${resolved.taskTitle}»?`,
        "",
        `Комментарий: ${resolved.text}`,
      ].join("\n") + CONFIRM_FOOTER;

    case "mention_in_task":
      return [
        `Позвать ${resolved.mentionedUserName} в задачу «${resolved.taskTitle}»?`,
        "",
        `Комментарий: ${resolved.text}`,
      ].join("\n") + CONFIRM_FOOTER;

    case "transfer_task":
      return [
        `Передать задачу «${resolved.taskTitle}» сотруднику ${resolved.toUserName}?`,
        "",
        `Комментарий: ${resolved.comment?.trim() || "не указан"}`,
        "",
        transferPreviewNote(resolved.requestedByRole),
      ].join("\n") + CONFIRM_FOOTER;

    default:
      return "Подтвердить действие?" + CONFIRM_FOOTER;
  }
}
