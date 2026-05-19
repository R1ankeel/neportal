/** Минимальные типы ответов REST API (Decimal приходит строкой). */

export type ApiUser = {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
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

export type ApiBudgetExpense = {
  id: string;
  amount: string | number;
  currency: string;
  description: string | null;
  expenseDate: string;
  status: string;
  source: string;
  user?: { id: string; fullName: string; email: string | null };
};

export type ApiProjectSummary = {
  tasksTotal: number;
  tasksNew: number;
  tasksInProgress: number;
  tasksDone: number;
  budgetsTotal: number;
  budgetsRemainingTotal: number;
};

export type ApiNote = {
  id: string;
  text: string;
  source: string;
  createdAt: string;
  creator?: { id: string; fullName: string };
  project?: { id: string; name: string } | null;
};
