import { getPendingAbsenceSelection } from "./pending-absence-selection";
import { getPendingBudgetSelection } from "./pending-budget-selection";
import { getPendingConfirmationEdit } from "./pending-confirmation-edit";
import { getPendingExpenseReceiptSelection } from "./pending-expense-receipt-selection";
import { getPendingTaskSelection } from "./pending-task-selection";
import { getPendingUserSelection } from "./pending-user-selection";
import { getPendingCreateTaskAssignee } from "./pending-create-task-assignee";
import { getPendingProjectSelection } from "./pending-project-selection";
import { formatIsoDateRu } from "./parse-ru-date";
import { formatMoney } from "./api";

export type ActiveChoiceKind =
  | "confirmation_edit_field"
  | "expense_receipt"
  | "budget"
  | "project"
  | "absence"
  | "task"
  | "user"
  | "create_task_assignee";

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

  const project = getPendingProjectSelection(telegramUserId);
  if (project) {
    return {
      kind: "project",
      choiceId: project.choiceId,
      optionCount: project.candidates.length,
      labels: project.candidates.map((candidate) => candidate.name),
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

  const assignee = getPendingCreateTaskAssignee(telegramUserId);
  if (assignee && assignee.candidates.length > 0) {
    return {
      kind: "create_task_assignee",
      choiceId: assignee.choiceId,
      optionCount: assignee.candidates.length,
      labels: assignee.candidates.map((candidate) =>
        candidate.kind === "self" ? "👤 Мне" : candidate.label,
      ),
    };
  }

  return null;
}
