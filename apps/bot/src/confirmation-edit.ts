import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import { parseAmount, fetchUsers } from "./api";
import {
  CONFIRM_REPLY_PROMPT,
  isConfirmationCancel,
  isConfirmationEdit,
  isConfirmationNo,
} from "./confirmation";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { handleAddTaskCommentIntent } from "./handle-task-comment-intent";
import { handleMentionInTaskIntent } from "./handle-mention-intent";
import { handleTaskActionIntent } from "./handle-task-intent";
import { handleTransferTaskIntent } from "./handle-transfer-intent";
import { buildIntentPreview } from "./intent-preview";
import { resolveIntent } from "./intent-resolver";
import {
  getPendingConfirmation,
  setPendingConfirmation,
  type PendingAiIntent,
} from "./pending-intent";
import {
  clearPendingConfirmationEdit,
  getPendingConfirmationEdit,
  startPendingConfirmationEdit,
} from "./pending-confirmation-edit";
import {
  coerceDeadlineDateLoose,
  parseRuDate,
  resolveDeadlineFromUserMessage,
  todayIsoDate,
} from "./parse-ru-date";
import { isSelfHint, SELF_HINT_MARKER } from "./resolve-users-by-hint";
import {
  buildUserSelectionPayload,
  resolveUserHintWithSelection,
  selectionTypeForIntent,
  tryHandleAmbiguousUserHintBeforeResolve,
} from "./user-hint-resolution";
import { handleCancelAbsenceIntent } from "./absence-cancel-flow";

type ParsedEdit = { key: string; value: string };

type ApplyEditResult =
  | { ok: true; intent: AiIntent }
  | { ok: false; message: string };

function parseKeyValueEdit(text: string): ParsedEdit | null {
  const m = text.trim().match(/^([^:：]+)\s*[:：]\s*(.+)$/su);
  if (!m) return null;
  const key = m[1].trim().toLowerCase();
  const value = m[2].trim();
  if (!key || !value) return null;
  return { key, value };
}

function parseDateEditValue(value: string): string | null {
  const iso = parseRuDate(value);
  if (iso) return iso;
  return resolveDeadlineFromUserMessage(value, todayIsoDate());
}

function normalizeAssigneeHint(value: string): string {
  const t = value.trim();
  if (t === SELF_HINT_MARKER || isSelfHint(t)) return SELF_HINT_MARKER;
  return t;
}

export function getConfirmationEditHint(intent: AiIntent): string {
  const header = "Что изменить?\n\nМожно написать:";
  switch (intent.intent) {
    case "create_task":
      return [
        header,
        "задача: новый текст",
        "исполнитель: имя сотрудника или «мне»",
        "дедлайн: дата",
        "описание: новый текст",
      ].join("\n");
    case "add_task_comment":
      return [header, "комментарий: новый текст", "задача: название задачи"].join("\n");
    case "mention_in_task":
      return [
        header,
        "сотрудник: имя",
        "задача: название задачи",
        "комментарий: новый текст",
      ].join("\n");
    case "complete_task":
      return [header, "задача: название задачи", "результат: новый текст"].join("\n");
    case "cancel_task":
      return [header, "задача: название задачи", "причина: новый текст"].join("\n");
    case "transfer_task":
      return [
        header,
        "задача: название задачи",
        "исполнитель: кому передать",
        "комментарий: новый текст",
      ].join("\n");
    case "create_expense":
      return [
        header,
        "сумма: 1500",
        "описание: новый текст",
        "бюджет: название бюджета",
      ].join("\n");
    case "create_absence":
      return [
        header,
        "сотрудник: имя или «мне»",
        "дата окончания: 25.05.2026",
        "дата начала: 20.05.2026",
        "номер: 123456",
        "комментарий: текст",
      ].join("\n");
    default:
      return "Напишите исправленный текст одной строкой.";
  }
}

function invalidEditFormatMessage(intent: AiIntent): string {
  const hint = getConfirmationEditHint(intent);
  const firstLine = hint.split("\n").find((l) => l.includes(":"));
  const example = firstLine ?? "задача: новый текст";
  return `Не понял, что изменить. Напишите в формате:\n${example}`;
}

function applyEditToIntent(intent: AiIntent, parsed: ParsedEdit): ApplyEditResult {
  const { key, value } = parsed;

  switch (intent.intent) {
    case "create_task": {
      if (key === "задача" || key === "название") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, title: value } } };
      }
      if (key === "исполнитель" || key === "кому") {
        return {
          ok: true,
          intent: {
            ...intent,
            payload: { ...intent.payload, assigneeHint: normalizeAssigneeHint(value) },
          },
        };
      }
      if (key === "дедлайн" || key === "срок") {
        const deadlineDate =
          parseDateEditValue(value) ?? coerceDeadlineDateLoose(value, todayIsoDate());
        if (!deadlineDate) {
          return { ok: false, message: "Не удалось разобрать дату. Пример: 25.05.2026" };
        }
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, deadlineDate } },
        };
      }
      if (key === "описание") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, description: value } },
        };
      }
      break;
    }

    case "add_task_comment": {
      if (key === "комментарий" || key === "текст") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, text: value } } };
      }
      if (key === "задача" || key === "название") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
        };
      }
      break;
    }

    case "mention_in_task": {
      if (key === "сотрудник" || key === "кого") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, userHint: value } } };
      }
      if (key === "комментарий" || key === "текст") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, text: value } } };
      }
      if (key === "задача" || key === "название") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
        };
      }
      break;
    }

    case "complete_task": {
      if (key === "результат") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, completionResult: value } },
        };
      }
      if (key === "задача" || key === "название") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
        };
      }
      break;
    }

    case "cancel_task": {
      if (key === "причина") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, cancellationReason: value } },
        };
      }
      if (key === "задача" || key === "название") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
        };
      }
      break;
    }

    case "transfer_task": {
      if (key === "исполнитель" || key === "кому") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, toUserHint: value } },
        };
      }
      if (key === "комментарий" || key === "причина") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, comment: value } } };
      }
      if (key === "задача" || key === "название") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
        };
      }
      break;
    }

    case "create_expense": {
      if (key === "сумма") {
        const amount = parseAmount(value.replace(/\s/g, "").replace(",", "."));
        if (amount <= 0) {
          return { ok: false, message: "Укажите положительную сумму, например: сумма: 1500" };
        }
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, amount } } };
      }
      if (key === "описание" || key === "расход") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, description: value } },
        };
      }
      if (key === "бюджет") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, budgetHint: value } },
        };
      }
      break;
    }

    case "create_absence": {
      if (key === "сотрудник") {
        return {
          ok: true,
          intent: {
            ...intent,
            payload: { ...intent.payload, userHint: normalizeAssigneeHint(value) },
          },
        };
      }
      if (key === "дата окончания" || key === "до") {
        const endDate = parseDateEditValue(value);
        if (!endDate) {
          return { ok: false, message: "Не удалось разобрать дату окончания. Пример: 25.05.2026" };
        }
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, endDate } } };
      }
      if (key === "дата начала" || key === "с") {
        const startDate = parseDateEditValue(value);
        if (!startDate) {
          return { ok: false, message: "Не удалось разобрать дату начала. Пример: 20.05.2026" };
        }
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, startDate } } };
      }
      if (key === "номер") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, documentNumber: value } },
        };
      }
      if (key === "комментарий") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, comment: value } } };
      }
      break;
    }

    default:
      return { ok: false, message: "Для этого действия правка по ключу пока не поддерживается." };
  }

  return { ok: false, message: invalidEditFormatMessage(intent) };
}

async function reconfirmAfterEdit(
  ctx: Context,
  telegramUserId: number,
  intent: AiIntent,
): Promise<boolean> {
  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    await ctx.reply(NOT_LINKED_MESSAGE);
    return false;
  }

  switch (intent.intent) {
    case "create_task":
    case "create_note":
    case "create_expense":
    case "create_absence": {
      const users = await fetchUsers();
      if (await tryHandleAmbiguousUserHintBeforeResolve(ctx, linked, telegramUserId, intent, users)) {
        clearPendingConfirmationEdit(telegramUserId);
        return true;
      }

      const resolvedResult = await resolveIntent(intent, telegramUserId);
      if (!resolvedResult.ok) {
        if (resolvedResult.message === "USER_SELECTION_NEEDED") {
          const selectionType = selectionTypeForIntent(intent);
          const payload = buildUserSelectionPayload(intent, linked);
          const hint =
            intent.intent === "create_absence"
              ? intent.payload.userHint
              : intent.intent === "create_task"
                ? intent.payload.assigneeHint
                : undefined;
          if (selectionType && payload && hint?.trim()) {
            await resolveUserHintWithSelection(
              ctx,
              telegramUserId,
              users,
              hint,
              linked,
              selectionType,
              payload,
            );
            clearPendingConfirmationEdit(telegramUserId);
            return true;
          }
        }
        await ctx.reply(resolvedResult.message);
        return false;
      }

      setPendingConfirmation(telegramUserId, {
        type: "ai_intent",
        intent,
        resolved: resolvedResult.resolved,
      });
      await ctx.reply(buildIntentPreview(resolvedResult.resolved));
      return true;
    }

    case "complete_task":
    case "cancel_task":
    case "start_task":
    case "set_task_deadline":
      await handleTaskActionIntent(ctx, linked, telegramUserId, intent);
      return getPendingConfirmation(telegramUserId)?.type === "ai_intent";

    case "add_task_comment":
      await handleAddTaskCommentIntent(ctx, linked, telegramUserId, intent);
      return getPendingConfirmation(telegramUserId)?.type === "ai_intent";

    case "mention_in_task":
      await handleMentionInTaskIntent(ctx, linked, telegramUserId, intent);
      return getPendingConfirmation(telegramUserId)?.type === "ai_intent";

    case "transfer_task":
      await handleTransferTaskIntent(ctx, linked, telegramUserId, intent);
      return getPendingConfirmation(telegramUserId)?.type === "ai_intent";

    case "cancel_absence":
      await handleCancelAbsenceIntent(ctx, linked, telegramUserId, intent, "");
      return getPendingConfirmation(telegramUserId)?.type === "ai_intent";

    default:
      await ctx.reply("Для этого действия правка пока не поддерживается.");
      return false;
  }
}

export function enterConfirmationEditMode(
  telegramUserId: number,
  pending: PendingAiIntent,
): void {
  startPendingConfirmationEdit(telegramUserId, pending);
}

/** Обработка сообщения в режиме правки confirmation. Возвращает true, если обработано. */
export async function handlePendingConfirmationEditMessage(
  ctx: Context,
  telegramUserId: number,
  text: string,
): Promise<boolean> {
  const editPending = getPendingConfirmationEdit(telegramUserId);
  if (!editPending) return false;

  const confirmation = getPendingConfirmation(telegramUserId);
  if (!confirmation || confirmation.type !== "ai_intent") {
    clearPendingConfirmationEdit(telegramUserId);
    return false;
  }

  if (isConfirmationNo(text)) {
    clearPendingConfirmationEdit(telegramUserId);
    return false; // ai-message обработает отмену confirmation
  }

  if (isConfirmationCancel(text)) {
    clearPendingConfirmationEdit(telegramUserId);
    await ctx.reply(`Продолжаем подтверждение. ${CONFIRM_REPLY_PROMPT}`);
    await ctx.reply(buildIntentPreview(confirmation.resolved));
    return true;
  }

  if (isConfirmationEdit(text)) {
    await ctx.reply(getConfirmationEditHint(editPending.originalConfirmation.intent));
    return true;
  }

  const parsed = parseKeyValueEdit(text);
  if (!parsed) {
    await ctx.reply(invalidEditFormatMessage(editPending.originalConfirmation.intent));
    return true;
  }

  const applyResult = applyEditToIntent(editPending.originalConfirmation.intent, parsed);
  if (!applyResult.ok) {
    await ctx.reply(applyResult.message);
    return true;
  }

  const updatedIntent = applyResult.intent;
  editPending.originalConfirmation.intent = updatedIntent;

  const ok = await reconfirmAfterEdit(ctx, telegramUserId, updatedIntent);
  if (ok) {
    clearPendingConfirmationEdit(telegramUserId);
  }
  return true;
}
