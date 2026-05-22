/** Минимальные типы ответов REST API (Decimal приходит строкой). */

export type ApiUser = {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  telegramId: string | null;
  telegramUsername: string | null;
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

export type ApiTaskUser = {
  id: string;
  fullName: string;
  role?: string;
  telegramId?: string | null;
};

export type ApiTaskCommentMention = {
  id: string;
  mentionedUser: { id: string; fullName: string; role: string };
};

export type ApiTaskComment = {
  id: string;
  text: string;
  source: string;
  createdAt: string;
  author: { id: string; fullName: string; role: string };
  mentions?: ApiTaskCommentMention[];
};

export type ApiTaskTransfer = {
  id: string;
  taskId: string;
  fromUserId: string;
  toUserId: string;
  requestedById: string;
  comment: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  fromUser: { id: string; fullName: string; role: string };
  toUser: { id: string; fullName: string; role: string };
  requestedBy: { id: string; fullName: string; role: string };
};

export type ApiTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  deadlineAt: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  completionResult?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
  creator?: ApiTaskUser;
  assignee?: ApiTaskUser | null;
  project?: { id: string; name: string } | null;
  comments?: ApiTaskComment[];
  transfers?: ApiTaskTransfer[];
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
