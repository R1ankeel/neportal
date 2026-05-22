import {
  createAbsence,
  createBudgetExpense,
  createNote,
  createTask,
  formatMoney,
  parseAmount,
  setTaskDeadline,
} from "./api";
import { getLinkedUserByTelegramId } from "./current-user";
import { executeTaskStatusChange } from "./task-status-flow";
import { formatIsoDateRu } from "./parse-ru-date";
import type { ResolvedIntent } from "./intent-resolver";
import { setLastExpense } from "./last-expense";
import type { Api } from "grammy";
import { notifyTaskAssigned } from "./task-notifications";

export async function executeResolvedIntent(
  resolved: ResolvedIntent,
  telegramUserId?: number,
  botApi?: Api,
): Promise<string> {
  switch (resolved.intent) {
    case "create_task": {
      const task = await createTask({
        title: resolved.title,
        description: resolved.description,
        creatorId: resolved.creatorId,
        assigneeId: resolved.assignee?.id,
        projectId: resolved.project.id,
        ...(resolved.deadlineDate ? { deadlineAt: resolved.deadlineDate } : {}),
      });

      if (botApi) {
        try {
          await notifyTaskAssigned(botApi, task);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[task-notifications] assign notify error: ${msg}`);
        }
      }

      const parts = [`Задача создана в проекте «${resolved.project.name}»: ${task.title}`];
      if (resolved.assignee) {
        parts.push(`Исполнитель: ${resolved.assignee.fullName}`);
      }
      if (resolved.deadlineDate) {
        parts.push(`Дедлайн: ${formatIsoDateRu(resolved.deadlineDate)}`);
      }
      return parts.join("\n");
    }

    case "create_note": {
      const note = await createNote({
        text: resolved.text,
        creatorId: resolved.creatorId,
        projectId: resolved.project.id,
        source: "TELEGRAM_TEXT",
      });
      return `Заметка создана в проекте «${resolved.project.name}»: ${note.text}`;
    }

    case "create_expense": {
      const result = await createBudgetExpense(resolved.budget.id, {
        userId: resolved.userId,
        amount: resolved.amount,
        description: resolved.description,
        source: "TELEGRAM_TEXT",
      });

      const updatedBudget = result.budget;
      const remaining =
        parseAmount(updatedBudget.initialAmount) - parseAmount(updatedBudget.spentAmount);

      if (telegramUserId) {
        setLastExpense(telegramUserId, {
          expenseId: result.id,
          budgetTitle: updatedBudget.title,
          amount: resolved.amount,
          createdAt: new Date(),
          uploadedById: resolved.userId,
        });
      }

      return [
        `Расход создан в бюджете «${updatedBudget.title}»: ${formatMoney(resolved.amount, updatedBudget.currency)}`,
        `Остаток бюджета: ${formatMoney(remaining, updatedBudget.currency)}`,
        "",
        "Отправьте фото или документ чека, чтобы прикрепить его к этому расходу.",
      ].join("\n");
    }

    case "create_absence": {
      await createAbsence({
        userId: resolved.user.id,
        type: resolved.type,
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        documentNumber: resolved.documentNumber,
        status: "APPROVED",
      });

      const label = resolved.type === "SICK_LEAVE" ? "Больничный" : "Отпуск";
      return `${label} добавлен для ${resolved.user.fullName}: с ${formatIsoDateRu(resolved.startDate)} по ${formatIsoDateRu(resolved.endDate)}.`;
    }

    case "set_task_deadline": {
      await setTaskDeadline(resolved.taskId, resolved.deadlineDate);
      return `Дедлайн задачи «${resolved.taskTitle}» установлен на ${formatIsoDateRu(resolved.deadlineDate)}.`;
    }

    case "complete_task":
    case "cancel_task": {
      const linked =
        telegramUserId != null ? await getLinkedUserByTelegramId(telegramUserId) : null;
      if (!linked) {
        return "Вы не привязаны ни к какому проекту.";
      }
      if (!botApi) {
        return "Не удалось отправить уведомление.";
      }

      if (resolved.intent === "complete_task" && !resolved.completionResult?.trim()) {
        return "Укажите результат выполнения задачи.";
      }
      if (resolved.intent === "cancel_task" && !resolved.cancellationReason?.trim()) {
        return "Укажите причину отмены задачи.";
      }

      return executeTaskStatusChange(botApi, linked, resolved);
    }

    default:
      return "Действие выполнено.";
  }
}
