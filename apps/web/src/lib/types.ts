/** Минимальные типы ответов REST API (Decimal приходит строкой). */

export type ApiUser = {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  telegramId: string | null;
};

export type ApiProject = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; fullName: string; email: string | null };
};

export type ApiTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  deadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  creator?: { id: string; fullName: string };
  assignee?: { id: string; fullName: string } | null;
  project?: { id: string; name: string } | null;
};

export type ApiBudget = {
  id: string;
  title: string;
  description: string | null;
  initialAmount: string | number;
  spentAmount: string | number;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; fullName: string };
  project?: { id: string; name: string } | null;
};

export type ApiBudgetExpenseAttachment = {
  id: string;
  mimeType: string | null;
  originalFilename: string | null;
  telegramFileId: string | null;
  createdAt: string;
};

export type ApiBudgetExpense = {
  id: string;
  amount: string | number;
  currency: string;
  description: string | null;
  expenseDate: string;
  status: string;
  source: string;
  user?: { id: string; fullName: string; email: string | null };
  attachments?: ApiBudgetExpenseAttachment[];
};

export type ApiProjectSummary = {
  tasksTotal: number;
  tasksNew: number;
  tasksInProgress: number;
  tasksDone: number;
  budgetsTotal: number;
  budgetsRemainingTotal: number;
  absencesTotal: number;
  absencesActiveNow: number;
};

export type ApiNote = {
  id: string;
  text: string;
  source: string;
  createdAt: string;
  creator?: { id: string; fullName: string };
  project?: { id: string; name: string } | null;
};

export type ApiAbsenceAffectedTask = {
  id: string;
  title: string;
  status: string;
  deadlineAt: string | null;
};

export type ApiAbsence = {
  id: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  documentNumber: string | null;
  comment: string | null;
  user: { id: string; fullName: string; role: string };
  affectedTasks: ApiAbsenceAffectedTask[];
};
