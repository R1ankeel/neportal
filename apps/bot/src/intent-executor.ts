import { executeCancelAbsence } from "./absence-cancel-flow";
import { createAbsenceWithImpact } from "./absence-impact-flow";
import {
  createBudget,
  createBudgetExpense,
  createNote,
  createTask,
  setTaskDeadline,
} from "./api";
import { formatExpenseCreatedReply } from "./expense-reply";
import { getLinkedUserByTelegramId } from "./current-user";
import { executeTaskComment } from "./task-comment-flow";
import { executeMentionInTask } from "./task-mention-flow";
import { executeReassignTask } from "./task-reassign-flow";
import { executeTransferTask } from "./task-transfer-flow";
import { executeStartTask } from "./task-start-flow";
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
        actorUserId: resolved.creatorId,
        source: "TELEGRAM_TEXT",
      });
      return `Заметка создана: ${note.text}`;
    }

    case "create_budget": {
      const budget = await createBudget(resolved.creatorId, {
        projectId: resolved.project.id,
        name: resolved.name,
        amount: resolved.amount,
        requiresReceipt: resolved.requiresReceipt,
        matchingKeywords: resolved.matchingKeywords,
      });
      const receiptLabel = resolved.requiresReceipt ? "да" : "нет";
      return [
        `Бюджет создан в проекте «${resolved.project.name}»: ${budget.title}`,
        `Сумма: ${resolved.amount} ₽`,
        `Чек обязателен: ${receiptLabel}`,
      ].join("\n");
    }

    case "create_expense": {
      const result = await createBudgetExpense(resolved.budget.id, {
        userId: resolved.userId,
        actorUserId: resolved.userId,
        amount: resolved.amount,
        description: resolved.description,
        source: "TELEGRAM_TEXT",
      });

      const updatedBudget = result.budget;
      const pendingReceipt = result.status === "PENDING_RECEIPT";

      if (telegramUserId) {
        setLastExpense(telegramUserId, {
          expenseId: result.id,
          budgetTitle: updatedBudget.title,
          amount: resolved.amount,
          createdAt: new Date(),
          uploadedById: resolved.userId,
          pendingReceipt,
        });
      }

      return formatExpenseCreatedReply(updatedBudget, resolved.amount, {
        requiresReceipt: updatedBudget.requiresReceipt,
        pendingReceipt,
      });
    }

    case "create_absence": {
      if (!botApi) {
        return "Не удалось обработать отсутствие: бот недоступен.";
      }
      if (telegramUserId == null) {
        return "Не удалось обработать отсутствие: пользователь не определён.";
      }
      const actor = await getLinkedUserByTelegramId(telegramUserId);
      if (!actor) {
        return "Сначала привяжите аккаунт через /start.";
      }
      const { replyMessage } = await createAbsenceWithImpact(botApi, {
        actorUserId: actor.id,
        body: {
          userId: resolved.user.id,
          type: resolved.type,
          startDate: resolved.startDate,
          endDate: resolved.endDate,
          documentNumber: resolved.documentNumber,
          status: "APPROVED",
        },
        absenceUser: resolved.user,
      });
      return replyMessage;
    }

    case "cancel_absence":
      return executeCancelAbsence(resolved);

    case "set_task_deadline": {
      await setTaskDeadline(resolved.taskId, resolved.deadlineDate);
      return `Дедлайн задачи «${resolved.taskTitle}» установлен на ${formatIsoDateRu(resolved.deadlineDate)}.`;
    }

    case "start_task": {
      const linked =
        telegramUserId != null ? await getLinkedUserByTelegramId(telegramUserId) : null;
      if (!linked) {
        return "Вы не привязаны ни к какому проекту.";
      }
      if (!botApi) {
        return "Не удалось отправить уведомление.";
      }
      return executeStartTask(botApi, linked, resolved);
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

    case "add_task_comment": {
      const linked =
        telegramUserId != null ? await getLinkedUserByTelegramId(telegramUserId) : null;
      if (!linked) {
        return "Вы не привязаны ни к какому проекту.";
      }
      if (!botApi) {
        return "Не удалось отправить уведомление.";
      }
      return executeTaskComment(botApi, linked, resolved);
    }

    case "mention_in_task": {
      const linked =
        telegramUserId != null ? await getLinkedUserByTelegramId(telegramUserId) : null;
      if (!linked) {
        return "Вы не привязаны ни к какому проекту.";
      }
      if (!botApi) {
        return "Не удалось отправить уведомление.";
      }
      return executeMentionInTask(botApi, linked, resolved);
    }

    case "transfer_task": {
      const linked =
        telegramUserId != null ? await getLinkedUserByTelegramId(telegramUserId) : null;
      if (!linked) {
        return "Вы не привязаны ни к какому проекту.";
      }
      if (!botApi) {
        return "Не удалось отправить уведомление.";
      }
      return executeTransferTask(botApi, linked, resolved);
    }

    case "reassign_task": {
      const linked =
        telegramUserId != null ? await getLinkedUserByTelegramId(telegramUserId) : null;
      if (!linked) {
        return "Вы не привязаны ни к какому проекту.";
      }
      if (!botApi) {
        return "Не удалось отправить уведомление.";
      }
      return executeReassignTask(botApi, linked, resolved);
    }

    default:
      return "Действие выполнено.";
  }
}
