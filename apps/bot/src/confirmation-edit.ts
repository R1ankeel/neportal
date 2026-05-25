import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import { isConfirmationCancel, isConfirmationEdit, isConfirmationNo } from "./confirmation";
import { applyFieldEdit } from "./confirmation/apply-field-edit";
import {
  formatFieldSelectionMessage,
  getEditableFields,
  getFieldValuePrompt,
  legacyKeyToFieldKey,
} from "./confirmation/editable-fields";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";
import { handleAddTaskCommentIntent } from "./handle-task-comment-intent";
import { handleMentionInTaskIntent } from "./handle-mention-intent";
import { handleTaskActionIntent } from "./handle-task-intent";
import { handleReassignTaskIntent } from "./handle-reassign-intent";
import { handleTransferTaskIntent } from "./handle-transfer-intent";
import { formatBudgetSelectionMessage } from "./budget-selection-format";
import { resolveCreateExpense } from "./create-expense-flow";
import { replyWithIntentPreview } from "./intent-preview";
import { resolveIntent } from "./intent-resolver";
import { startPendingBudgetSelection } from "./pending-budget-selection";
import {
  clearPendingConfirmation,
  getPendingConfirmation,
  setPendingConfirmation,
  type PendingAiIntent,
} from "./pending-intent";
import {
  clearPendingConfirmationEdit,
  getPendingConfirmationEdit,
  setConfirmationEditStep,
  startPendingConfirmationEdit,
} from "./pending-confirmation-edit";
import { parseBudgetReceiptEdit } from "./parse-budget-receipt-edit";
import {
  buildUserSelectionPayload,
  resolveUserHintWithSelection,
  selectionTypeForIntent,
  tryHandleAmbiguousUserHintBeforeResolve,
} from "./user-hint-resolution";
import { handleCancelAbsenceIntent } from "./absence-cancel-flow";
import { fetchUsers } from "./api";

type ParsedEdit = { key: string; value: string };

const EDIT_CANCEL_RE = /^(?:отмена|отмени|стоп)$/iu;

function parseKeyValueEdit(text: string): ParsedEdit | null {
  const m = text.trim().match(/^([^:：]+)\s*[:：]\s*(.+)$/su);
  if (!m) return null;
  const key = m[1].trim().toLowerCase();
  const value = m[2].trim();
  if (!key || !value) return null;
  return { key, value };
}

function parseFieldSelectionNumber(text: string): number | null {
  const m = text.trim().match(/^(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}

function isEditFlowCancel(text: string): boolean {
  return EDIT_CANCEL_RE.test(text.trim()) || isConfirmationCancel(text);
}

/** Запускает edit-flow; возвращает текст сообщения со списком полей или fallback-подсказку. */
export function enterConfirmationEditMode(
  telegramUserId: number,
  pending: PendingAiIntent,
): string {
  const fields = getEditableFields(pending.intent);
  startPendingConfirmationEdit(telegramUserId, pending, fields);
  if (fields.length === 0) {
    return getLegacyEditHint(pending.intent);
  }
  return formatFieldSelectionMessage(fields);
}

function getLegacyEditHint(intent: AiIntent): string {
  const header = "Что изменить?\n\nМожно написать поле: значение, например:";
  switch (intent.intent) {
    case "create_note":
      return `${header}\nтекст: новый текст`;
    default:
      return "Напишите исправленный текст одной строкой.";
  }
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
    case "create_expense": {
      const expenseResult = await resolveCreateExpense(linked, {
        amount: intent.payload.amount,
        description: intent.payload.description,
        projectHint: intent.payload.projectHint,
        budgetHint: intent.payload.budgetHint,
      });

      if (expenseResult.kind === "error") {
        await ctx.reply(expenseResult.message);
        return false;
      }

      if (expenseResult.kind === "selection") {
        startPendingBudgetSelection(telegramUserId, {
          candidates: expenseResult.candidates,
          payload: {
            amount: intent.payload.amount,
            description: intent.payload.description,
            projectId: expenseResult.project.id,
            projectName: expenseResult.project.name,
            userId: linked.id,
            budgetHint: intent.payload.budgetHint,
            source: "TELEGRAM_TEXT",
          },
        });
        await ctx.reply(
          formatBudgetSelectionMessage(expenseResult.candidates, {
            ambiguous: expenseResult.ambiguous,
          }),
        );
        return true;
      }

      setPendingConfirmation(telegramUserId, {
        type: "ai_intent",
        intent,
        resolved: expenseResult.resolved,
      });
      await replyWithIntentPreview(ctx, telegramUserId, expenseResult.resolved);
      return true;
    }

    case "create_task":
    case "create_note":
    case "create_budget":
    case "create_absence": {
      const users = await fetchUsers();
      if (await tryHandleAmbiguousUserHintBeforeResolve(ctx, linked, telegramUserId, intent, users)) {
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
      await replyWithIntentPreview(ctx, telegramUserId, resolvedResult.resolved);
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

    case "reassign_task":
      await handleReassignTaskIntent(ctx, linked, telegramUserId, intent);
      return getPendingConfirmation(telegramUserId)?.type === "ai_intent";

    case "cancel_absence":
      await handleCancelAbsenceIntent(ctx, linked, telegramUserId, intent, "");
      return getPendingConfirmation(telegramUserId)?.type === "ai_intent";

    default:
      await ctx.reply("Для этого действия правка пока не поддерживается.");
      return false;
  }
}

async function applyEditAndReconfirm(
  ctx: Context,
  telegramUserId: number,
  editPending: NonNullable<ReturnType<typeof getPendingConfirmationEdit>>,
  updatedIntent: AiIntent,
): Promise<boolean> {
  editPending.originalConfirmation.intent = updatedIntent;
  const ok = await reconfirmAfterEdit(ctx, telegramUserId, updatedIntent);
  if (ok) {
    clearPendingConfirmationEdit(telegramUserId);
  }
  return ok;
}

async function tryLegacyKeyValueEdit(
  ctx: Context,
  telegramUserId: number,
  editPending: NonNullable<ReturnType<typeof getPendingConfirmationEdit>>,
  text: string,
): Promise<boolean> {
  const parsed = parseKeyValueEdit(text);
  if (!parsed) return false;

  const fieldKey = legacyKeyToFieldKey(parsed.key, editPending.intent);
  if (!fieldKey) {
    await ctx.reply(
      `Не понял поле «${parsed.key}». Выберите номер из списка или напишите, например: ${parsed.key}: ${parsed.value}`,
    );
    return true;
  }

  const applyResult = await applyFieldEdit(
    editPending.originalConfirmation.intent,
    fieldKey,
    parsed.value,
  );
  if (!applyResult.ok) {
    await ctx.reply(applyResult.message);
    return true;
  }

  await applyEditAndReconfirm(ctx, telegramUserId, editPending, applyResult.intent);
  return true;
}

async function handleFieldSelection(
  ctx: Context,
  telegramUserId: number,
  editPending: NonNullable<ReturnType<typeof getPendingConfirmationEdit>>,
  index: number,
): Promise<boolean> {
  const field = editPending.fields[index - 1];
  if (!field) {
    await ctx.reply("Выберите номер из списка.");
    return true;
  }

  if (field.key === "save") {
    clearPendingConfirmationEdit(telegramUserId);
    const confirmation = getPendingConfirmation(telegramUserId);
    if (confirmation?.type === "ai_intent") {
      await replyWithIntentPreview(ctx, telegramUserId, confirmation.resolved);
    }
    return true;
  }

  if (field.key === "cancel") {
    clearPendingConfirmationEdit(telegramUserId);
    clearPendingConfirmation(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  setConfirmationEditStep(telegramUserId, "await_value", field.key);
  const prompt = getFieldValuePrompt(field.key, editPending.originalConfirmation.intent);
  await ctx.reply(prompt);
  return true;
}

async function handleAwaitValue(
  ctx: Context,
  telegramUserId: number,
  editPending: NonNullable<ReturnType<typeof getPendingConfirmationEdit>>,
  text: string,
): Promise<boolean> {
  const fieldKey = editPending.field;
  if (!fieldKey) {
    setConfirmationEditStep(telegramUserId, "select_field");
    await ctx.reply(formatFieldSelectionMessage(editPending.fields));
    return true;
  }

  const applyResult = await applyFieldEdit(
    editPending.originalConfirmation.intent,
    fieldKey,
    text,
  );
  if (!applyResult.ok) {
    await ctx.reply(applyResult.message);
    return true;
  }

  await applyEditAndReconfirm(ctx, telegramUserId, editPending, applyResult.intent);
  return true;
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
    return false;
  }

  if (isEditFlowCancel(text)) {
    clearPendingConfirmationEdit(telegramUserId);
    clearPendingConfirmation(telegramUserId);
    await ctx.reply("Ок, действие отменено.");
    return true;
  }

  if (isConfirmationEdit(text)) {
    if (editPending.fields.length > 0) {
      setConfirmationEditStep(telegramUserId, "select_field");
      await ctx.reply(formatFieldSelectionMessage(editPending.fields));
    } else {
      await ctx.reply(getLegacyEditHint(editPending.originalConfirmation.intent));
    }
    return true;
  }

  if (await tryLegacyKeyValueEdit(ctx, telegramUserId, editPending, text)) {
    return true;
  }

  if (
    editPending.intent === "create_budget" &&
    editPending.step === "await_value" &&
    editPending.field === "requiresReceipt"
  ) {
    const receiptEdit = parseBudgetReceiptEdit(text);
    if (receiptEdit !== null) {
      const base = editPending.originalConfirmation.intent;
      if (base.intent === "create_budget") {
        const updatedIntent: AiIntent = {
          ...base,
          payload: { ...base.payload, requiresReceipt: receiptEdit },
        };
        await applyEditAndReconfirm(ctx, telegramUserId, editPending, updatedIntent);
      }
      return true;
    }
  }

  if (editPending.step === "select_field") {
    const num = parseFieldSelectionNumber(text);
    if (num !== null) {
      return handleFieldSelection(ctx, telegramUserId, editPending, num);
    }
    await ctx.reply("Не понял выбор. Напишите номер пункта из списка.");
    return true;
  }

  if (editPending.step === "await_value") {
    return handleAwaitValue(ctx, telegramUserId, editPending, text);
  }

  return false;
}

/** @deprecated Используйте enterConfirmationEditMode — возвращает текст списка полей. */
export function getConfirmationEditHint(intent: AiIntent): string {
  const fields = getEditableFields(intent);
  if (fields.length > 0) {
    return formatFieldSelectionMessage(fields);
  }
  return getLegacyEditHint(intent);
}
