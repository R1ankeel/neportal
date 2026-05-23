import {
  fetchBudgets,
  fetchMyTasks,
  fetchProjects,
  fetchTasks,
  fetchUsers,
  type ApiProject,
  type ApiUser,
} from "./api";
import type { PromptGroup } from "./ai/prompt-group-router";
import { todayIsoDate } from "./parse-ru-date";

const MAX_TASKS_IN_CONTEXT = 20;

export type IntentPromptContext = {
  currentDate: string;
  projects: ApiProject[];
  users: ApiUser[];
  budgets: Array<{ title: string; projectName: string }>;
  tasks: Array<{ title: string; projectName: string }>;
};

function isActiveTaskStatus(status: string): boolean {
  return status !== "DONE" && status !== "CANCELLED";
}

async function loadActiveTasks(
  linkedUserId: string | undefined,
  projects: ApiProject[],
): Promise<Array<{ title: string; projectName: string }>> {
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  if (linkedUserId) {
    const myTasks = await fetchMyTasks(linkedUserId, MAX_TASKS_IN_CONTEXT);
    return myTasks
      .filter((t) => isActiveTaskStatus(t.status))
      .slice(0, MAX_TASKS_IN_CONTEXT)
      .map((task) => ({
        title: task.title,
        projectName:
          task.project?.name ??
          (task.project?.id ? projectNameById.get(task.project.id) : undefined) ??
          "—",
      }));
  }

  const allTasks = await fetchTasks();
  return allTasks
    .filter((t) => isActiveTaskStatus(t.status))
    .slice(0, MAX_TASKS_IN_CONTEXT)
    .map((task) => ({
      title: task.title,
      projectName:
        task.project?.name ??
        (task.project?.id ? projectNameById.get(task.project.id) : undefined) ??
        "—",
    }));
}

async function loadBudgets(projects: ApiProject[]): Promise<
  Array<{ title: string; projectName: string }>
> {
  const budgets: Array<{ title: string; projectName: string }> = [];
  for (const project of projects) {
    const projectBudgets = await fetchBudgets(project.id);
    for (const budget of projectBudgets) {
      budgets.push({ title: budget.title, projectName: project.name });
    }
  }
  return budgets;
}

export type LoadIntentPromptContextOptions = {
  linkedUserId?: string;
};

/** Загружает только контекст, нужный для выбранной группы промпта. */
export async function loadIntentPromptContext(
  group: PromptGroup,
  options?: LoadIntentPromptContextOptions,
): Promise<IntentPromptContext> {
  const currentDate = todayIsoDate();
  const empty: IntentPromptContext = {
    currentDate,
    projects: [],
    users: [],
    budgets: [],
    tasks: [],
  };

  switch (group) {
    case "create-task": {
      const [projects, users] = await Promise.all([fetchProjects(), fetchUsers()]);
      return { ...empty, projects, users };
    }
    case "expense": {
      const projects = await fetchProjects();
      const budgets = await loadBudgets(projects);
      return { ...empty, projects, budgets };
    }
    case "absence":
    case "task-list": {
      const users = await fetchUsers();
      return { ...empty, users };
    }
    case "task-status":
    case "collaboration": {
      const [projects, users] = await Promise.all([fetchProjects(), fetchUsers()]);
      const tasks = await loadActiveTasks(options?.linkedUserId, projects);
      return { ...empty, users, tasks };
    }
    case "classifier": {
      const users = await fetchUsers();
      return { ...empty, users };
    }
    default:
      return empty;
  }
}

export function formatPromptContextForModel(
  ctx: IntentPromptContext,
  group: PromptGroup,
): string {
  const lines: string[] = [`Текущая дата: ${ctx.currentDate}`];

  if ((group === "create-task" || group === "expense") && ctx.projects.length > 0) {
    lines.push("", "Проекты:", ...ctx.projects.map((p) => `- ${p.name}`));
  }

  const includeUsers =
    group === "create-task" ||
    group === "absence" ||
    group === "task-list" ||
    group === "task-status" ||
    group === "collaboration" ||
    group === "classifier";

  if (includeUsers && ctx.users.length > 0) {
    lines.push("", "Пользователи:", ...ctx.users.map((u) => `- ${u.fullName}`));
  }

  if (group === "expense") {
    lines.push(
      "",
      "Бюджеты:",
      ...(ctx.budgets.length > 0
        ? ctx.budgets.map((b) => `- ${b.title} (проект: ${b.projectName})`)
        : ["- (нет)"]),
    );
  }

  if (
    (group === "task-status" || group === "collaboration") &&
    ctx.tasks.length > 0
  ) {
    lines.push(
      "",
      "Активные задачи:",
      ...ctx.tasks.map((t) => `- ${t.title} (проект: ${t.projectName})`),
    );
  }

  return lines.join("\n");
}
