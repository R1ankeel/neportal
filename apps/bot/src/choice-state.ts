import { getPendingAbsenceSelection } from "./pending-absence-selection";
import { getPendingBudgetSelection } from "./pending-budget-selection";
import { getPendingConfirmationEdit } from "./pending-confirmation-edit";
import { getPendingExpenseReceiptSelection } from "./pending-expense-receipt-selection";
import { getPendingTaskSelection } from "./pending-task-selection";
import { getPendingUserSelection } from "./pending-user-selection";
import { formatIsoDateRu } from "./parse-ru-date";
import { formatMoney } from "./api";

export type ActiveChoiceKind =
  | "confirmation_edit_field"
  | "expense_receipt"
  | "budget"
  | "absence"
  | "task"
  | "user";

export type ActiveChoice = {
  kind: ActiveChoiceKind;
  choiceId: string;
  optionCount: number;
  labels: string[];
};

function absenceLabel(type: "SICK_LEAVE" | "VACATION"): string {
  return type === "SICK_LEAVE" ? "Больничный" : "Отпуск";
}

export function getActiveChoice(telegramUserId: number): ActiveChoice | null {
  const edit = getPendingConfirmationEdit(telegramUserId);
  if (edit?.step === "select_field") {
    return {
      kind: "confirmation_edit_field",
      choiceId: edit.choiceId,
      optionCount: edit.fields.length,
      labels: edit.fields.map((field) => field.label),
    };
  }

  const expense = getPendingExpenseReceiptSelection(telegramUserId);
  if (expense) {
    return {
      kind: "expense_receipt",
      choiceId: expense.choiceId,
      optionCount: expense.expenses.length,
      labels: expense.expenses.map(
        (item) => `${formatMoney(item.amount)} — ${item.description?.trim() || "без описания"}`,
      ),
    };
  }

  const budget = getPendingBudgetSelection(telegramUserId);
  if (budget) {
    return {
      kind: "budget",
      choiceId: budget.choiceId,
      optionCount: budget.candidates.length,
      labels: budget.candidates.map((candidate) => candidate.name),
    };
  }

  const absence = getPendingAbsenceSelection(telegramUserId);
  if (absence) {
    return {
      kind: "absence",
      choiceId: absence.choiceId,
      optionCount: absence.candidates.length,
      labels: absence.candidates.map(
        (item) =>
          `${absenceLabel(item.type)} ${formatIsoDateRu(item.startDate)}—${formatIsoDateRu(item.endDate)}`,
      ),
    };
  }

  const task = getPendingTaskSelection(telegramUserId);
  if (task) {
    return {
      kind: "task",
      choiceId: task.choiceId,
      optionCount: task.candidates.length,
      labels: task.candidates.map((candidate) => candidate.title),
    };
  }

  const user = getPendingUserSelection(telegramUserId);
  if (user) {
    return {
      kind: "user",
      choiceId: user.choiceId,
      optionCount: user.candidates.length,
      labels: user.candidates.map((candidate) => candidate.fullName),
    };
  }

  return null;
}
