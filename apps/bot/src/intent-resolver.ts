import type { AiIntent } from "./ai-contracts";
import {
  fetchBudgets,
  fetchProjects,
  fetchTasks,
  fetchUsers,
  pickAbsenceUserId,
  pickAssigneeId,
  pickCreatorId,
  type ApiBudget,
  type ApiProject,
  type ApiUser,
} from "./api";
import { findBudgetByHint, findProjectByHint, findTaskByTitle, findUserByHint } from "./hint-matchers";
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

export type ResolvedIntent =
  | ResolvedCreateTask
  | ResolvedCreateNote
  | ResolvedCreateExpense
  | ResolvedCreateAbsence
  | ResolvedSetTaskDeadline;

export type ResolveResult =
  | { ok: true; resolved: ResolvedIntent }
  | { ok: false; message: string };

export async function resolveIntent(intent: AiIntent): Promise<ResolveResult> {
  if (intent.intent === "unknown") {
    return { ok: false, message: "Не понял команду. Попробуйте переформулировать или используйте /demo." };
  }

  const [users, projects] = await Promise.all([fetchUsers(), fetchProjects()]);

  switch (intent.intent) {
    case "create_task": {
      const creatorId = pickCreatorId(users);
      if (!creatorId) {
        return { ok: false, message: "Не удалось определить автора задачи." };
      }

      const project = findProjectByHint(projects, intent.payload.projectHint);
      if (!project) {
        return { ok: false, message: "Нет проектов. Сначала создайте проект в Web." };
      }

      const assigneeIdDefault = pickAssigneeId(users);
      const assignee = intent.payload.assigneeHint
        ? findUserByHint(users, intent.payload.assigneeHint)
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
          title: intent.payload.title,
          description: intent.payload.description,
          deadlineDate: intent.payload.deadlineDate,
        },
      };
    }

    case "create_note": {
      const creatorId = pickCreatorId(users);
      if (!creatorId) {
        return { ok: false, message: "Не удалось определить автора заметки." };
      }

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
      const userId = pickCreatorId(users);
      if (!userId) {
        return { ok: false, message: "Не удалось определить пользователя для расхода." };
      }

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
      const absenceDefault = pickAbsenceUserId(users);
      const user = intent.payload.userHint
        ? findUserByHint(users, intent.payload.userHint)
        : absenceDefault
          ? users.find((u) => u.id === absenceDefault.id)
          : undefined;

      if (!user) {
        return { ok: false, message: "Не удалось определить сотрудника." };
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

    case "set_task_deadline": {
      const allTasks = await fetchTasks();
      const match = findTaskByTitle(allTasks, intent.payload.taskTitle);

      if (match.kind === "not_found") {
        return { ok: false, message: "Задача не найдена." };
      }
      if (match.kind === "ambiguous") {
        const names = match.tasks.map((t) => `«${t.title}»`).join(", ");
        return { ok: false, message: `Найдено несколько задач: ${names}. Уточните название.` };
      }

      return {
        ok: true,
        resolved: {
          intent: "set_task_deadline",
          taskId: match.task.id,
          taskTitle: match.task.title,
          deadlineDate: intent.payload.deadlineDate,
          projectName: match.task.project?.name,
        },
      };
    }

    default:
      return { ok: false, message: "Не понял команду. Попробуйте переформулировать или используйте /demo." };
  }
}
