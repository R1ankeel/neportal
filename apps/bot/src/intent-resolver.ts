import type { AiIntent } from "./ai-contracts";
import {
  fetchBudgets,
  fetchProjects,
  fetchUsers,
  findUserByNameHint,
  pickAssigneeId,
  type ApiBudget,
  type ApiProject,
  type ApiUser,
} from "./api";
import {
  getLinkedUserByTelegramId,
  NOT_LINKED_MESSAGE,
} from "./current-user";
import { findBudgetByHint, findProjectByHint, findUserByHint } from "./hint-matchers";
import { normalizeCreateTaskPayload } from "./normalize-create-task";
import { replaceIsoDatesInText, todayIsoDate } from "./parse-ru-date";

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

export type ResolvedIntent =
  | ResolvedCreateTask
  | ResolvedCreateNote
  | ResolvedCreateExpense
  | ResolvedCreateAbsence
  | ResolvedSetTaskDeadline
  | ResolvedCompleteTask
  | ResolvedCancelTask;

export type ResolveResult =
  | { ok: true; resolved: ResolvedIntent }
  | { ok: false; message: string };

export async function resolveIntent(
  intent: AiIntent,
  telegramUserId?: number,
  userText?: string,
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

      const assigneeIdDefault = pickAssigneeId(users);
      const assignee = payload.assigneeHint
        ? findUserByHint(users, payload.assigneeHint)
        : assigneeIdDefault
          ? users.find((u) => u.id === assigneeIdDefault)
          : undefined;

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

      const budgets = await fetchBudgets(project.id);
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

      if (intent.payload.userHint) {
        const hint = intent.payload.userHint.trim();
        const match = findUserByNameHint(users, hint);
        if (match.kind === "none") {
          return {
            ok: false,
            message: `Не нашёл сотрудника «${hint}». Уточните имя.`,
          };
        }
        if (match.kind === "many") {
          const names = match.users.map((u) => u.fullName).join(", ");
          return {
            ok: false,
            message: `Нашёл несколько сотрудников: ${names}. Уточните ФИО.`,
          };
        }
        user = match.user;
      } else {
        user = currentUser;
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
