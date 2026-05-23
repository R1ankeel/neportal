import type { AiIntent } from "./ai-contracts";
import {
  fetchBudgets,
  fetchProjects,
  fetchUsers,
  findUserByNameHint,
  type ApiBudget,
  type ApiProject,
  type ApiUser,
} from "./api";
import {
  getLinkedUserByTelegramId,
  NOT_LINKED_MESSAGE,
} from "./current-user";
import { findBudgetByHint, findProjectByHint, findUserByHint } from "./hint-matchers";
import {
  isResolvableNamedUserHint,
  sanitizeAiUserHint,
} from "./fix-ai-intent-absence-user";
import { normalizeCreateTaskPayload } from "./normalize-create-task";
import { replaceIsoDatesInText, todayIsoDate } from "./parse-ru-date";
import { isSelfHint, SELF_HINT_MARKER } from "./resolve-users-by-hint";

export type ResolvedCreateTask = {
  intent: "create_task";
  project: ApiProject;
  assignee: ApiUser | undefined;
  creatorId: string;
  title: string;
  description?: string;
  deadlineDate?: string;
};

export type ResolvedCreateNote = {
  intent: "create_note";
  project: ApiProject;
  creatorId: string;
  text: string;
};

export type ResolvedCreateExpense = {
  intent: "create_expense";
  project: ApiProject;
  budget: ApiBudget;
  userId: string;
  amount: number;
  description?: string;
};

export type ResolvedCreateAbsence = {
  intent: "create_absence";
  user: ApiUser;
  type: "SICK_LEAVE" | "VACATION";
  startDate: string;
  endDate: string;
  documentNumber?: string;
};

export type ResolvedCancelAbsence = {
  intent: "cancel_absence";
  absenceId: string;
  absenceUserId: string;
  absenceUserName: string;
  type: "SICK_LEAVE" | "VACATION";
  startDate: string;
  endDate: string;
  cancellationReason?: string;
  cancelledById: string;
};

export type ResolvedSetTaskDeadline = {
  intent: "set_task_deadline";
  taskId: string;
  taskTitle: string;
  deadlineDate: string;
  projectName?: string;
};

export type ResolvedCompleteTask = {
  intent: "complete_task";
  taskId: string;
  taskTitle: string;
  completionResult?: string;
};

export type ResolvedCancelTask = {
  intent: "cancel_task";
  taskId: string;
  taskTitle: string;
  cancellationReason?: string;
};

export type ResolvedStartTask = {
  intent: "start_task";
  taskId: string;
  taskTitle: string;
};

export type ResolvedAddTaskComment = {
  intent: "add_task_comment";
  taskId: string;
  taskTitle: string;
  text: string;
  creatorId: string;
  assigneeId: string | null;
};

export type ResolvedMentionInTask = {
  intent: "mention_in_task";
  taskId: string;
  taskTitle: string;
  text: string;
  mentionedUserId: string;
  mentionedUserName: string;
  mentionedUserTelegramId: string | null;
  creatorId: string;
  assigneeId: string | null;
  projectName?: string;
};

export type ResolvedTransferTask = {
  intent: "transfer_task";
  taskId: string;
  taskTitle: string;
  comment?: string;
  toUserId: string;
  toUserName: string;
  toUserTelegramId: string | null;
  requestedByRole: string;
  projectName?: string;
  currentAssigneeId: string | null;
};

export type ResolvedReassignTask = {
  intent: "reassign_task";
  taskId: string;
  taskTitle: string;
  comment?: string;
  toUserId: string;
  toUserName: string;
  toUserTelegramId: string | null;
  fromUserId?: string;
  fromUserName?: string;
  currentAssigneeId: string | null;
  currentAssigneeName: string | null;
  creatorId: string;
  projectName?: string;
};

export type ResolvedIntent =
  | ResolvedCreateTask
  | ResolvedCreateNote
  | ResolvedCreateExpense
  | ResolvedCreateAbsence
  | ResolvedCancelAbsence
  | ResolvedSetTaskDeadline
  | ResolvedCompleteTask
  | ResolvedCancelTask
  | ResolvedStartTask
  | ResolvedAddTaskComment
  | ResolvedMentionInTask
  | ResolvedTransferTask
  | ResolvedReassignTask;

export type ResolveResult =
  | { ok: true; resolved: ResolvedIntent }
  | { ok: false; message: string };

export type ResolveIntentOverrides = {
  assigneeId?: string;
  absenceUserId?: string;
};

export async function resolveIntent(
  intent: AiIntent,
  telegramUserId?: number,
  userText?: string,
  overrides?: ResolveIntentOverrides,
): Promise<ResolveResult> {
  if (intent.intent === "unknown") {
    return { ok: false, message: "Не понял команду. Попробуйте переформулировать или используйте /demo." };
  }

  const linkedUser =
    telegramUserId != null
      ? await getLinkedUserByTelegramId(telegramUserId)
      : null;
  if (!linkedUser) {
    return { ok: false, message: NOT_LINKED_MESSAGE };
  }

  const [users, projects] = await Promise.all([fetchUsers(), fetchProjects()]);
  const currentUser = linkedUser;

  switch (intent.intent) {
    case "create_task": {
      const creatorId = currentUser.id;
      const payload = normalizeCreateTaskPayload(intent.payload, {
        userText,
      });

      const project = findProjectByHint(projects, payload.projectHint);
      if (!project) {
        return { ok: false, message: "Нет проектов. Сначала создайте проект в Web." };
      }

      let assignee: ApiUser | undefined;
      if (overrides?.assigneeId) {
        assignee = users.find((u) => u.id === overrides.assigneeId);
      } else if (payload.assigneeHint) {
        assignee = findUserByHint(users, payload.assigneeHint, currentUser);
      }

      return {
        ok: true,
        resolved: {
          intent: "create_task",
          project,
          assignee,
          creatorId,
          title: payload.title,
          description: payload.description,
          deadlineDate: payload.deadlineDate,
        },
      };
    }

    case "create_note": {
      const creatorId = currentUser.id;

      const project = findProjectByHint(projects, intent.payload.projectHint);
      if (!project) {
        return { ok: false, message: "Нет проектов. Сначала создайте проект в Web." };
      }

      return {
        ok: true,
        resolved: {
          intent: "create_note",
          project,
          creatorId,
          text: replaceIsoDatesInText(intent.payload.text),
        },
      };
    }

    case "create_expense": {
      const userId = currentUser.id;

      const project = findProjectByHint(projects, intent.payload.projectHint);
      if (!project) {
        return { ok: false, message: "Нет проектов. Сначала создайте проект в Web." };
      }

      const budgets = await fetchBudgets(project.id, userId);
      const budget = findBudgetByHint(budgets, intent.payload.budgetHint);
      if (!budget) {
        return { ok: false, message: `В проекте «${project.name}» нет бюджетов.` };
      }

      return {
        ok: true,
        resolved: {
          intent: "create_expense",
          project,
          budget,
          userId,
          amount: intent.payload.amount,
          description: intent.payload.description,
        },
      };
    }

    case "create_absence": {
      let user: ApiUser | undefined;

      if (overrides?.absenceUserId) {
        user = users.find((u) => u.id === overrides.absenceUserId);
      } else {
        const rawHint = sanitizeAiUserHint(intent.payload.userHint);
        const useSelf =
          rawHint === SELF_HINT_MARKER ||
          (rawHint != null && isSelfHint(rawHint)) ||
          !isResolvableNamedUserHint(rawHint);

        if (useSelf) {
          user = currentUser;
        } else {
          const match = findUserByNameHint(users, rawHint, currentUser);
          if (match.kind === "none") {
            return {
              ok: false,
              message: `Не нашёл сотрудника «${rawHint}». Проверьте имя.`,
            };
          }
          if (match.kind === "many") {
            return {
              ok: false,
              message: "USER_SELECTION_NEEDED",
            };
          }
          user = match.user;
        }
      }

      if (!user) {
        return { ok: false, message: NOT_LINKED_MESSAGE };
      }

      const startDate = intent.payload.startDate ?? todayIsoDate();
      const endDate = intent.payload.endDate;
      if (endDate < startDate) {
        return { ok: false, message: "Дата окончания не может быть раньше даты начала." };
      }

      return {
        ok: true,
        resolved: {
          intent: "create_absence",
          user,
          type: intent.payload.type,
          startDate,
          endDate,
          documentNumber: intent.payload.documentNumber,
        },
      };
    }

    default:
      return { ok: false, message: "Не понял команду. Попробуйте переформулировать или используйте /demo." };
  }
}
