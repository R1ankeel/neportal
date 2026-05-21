import {
  fetchBudgets,
  fetchProjects,
  fetchTasks,
  fetchUsers,
  type ApiProject,
  type ApiUser,
} from "./api";
import { todayIsoDate } from "./parse-ru-date";

export type IntentPromptContext = {
  currentDate: string;
  projects: ApiProject[];
  users: ApiUser[];
  budgets: Array<{ title: string; projectName: string }>;
  tasks: Array<{ title: string; projectName: string }>;
};

export async function loadIntentPromptContext(): Promise<IntentPromptContext> {
  const [projects, users] = await Promise.all([fetchProjects(), fetchUsers()]);
  const budgets: Array<{ title: string; projectName: string }> = [];
  const tasks: Array<{ title: string; projectName: string }> = [];

  for (const project of projects) {
    const projectBudgets = await fetchBudgets(project.id);
    for (const budget of projectBudgets) {
      budgets.push({ title: budget.title, projectName: project.name });
    }
  }

  const allTasks = await fetchTasks();
  for (const task of allTasks) {
    const projectName =
      task.project?.name ?? projects.find((p) => p.id === task.project?.id)?.name ?? "—";
    tasks.push({ title: task.title, projectName });
  }

  return {
    currentDate: todayIsoDate(),
    projects,
    users,
    budgets,
    tasks,
  };
}

export function formatPromptContextForModel(ctx: IntentPromptContext): string {
  const lines = [
    `Текущая дата: ${ctx.currentDate}`,
    "",
    "Проекты:",
    ...ctx.projects.map((p) => `- ${p.name}`),
    "",
    "Пользователи:",
    ...ctx.users.map((u) => `- ${u.fullName}`),
    "",
    "Бюджеты:",
    ...(ctx.budgets.length > 0
      ? ctx.budgets.map((b) => `- ${b.title} (проект: ${b.projectName})`)
      : ["- (нет)"]),
    "",
    "Задачи:",
    ...(ctx.tasks.length > 0
      ? ctx.tasks.map((t) => `- ${t.title} (проект: ${t.projectName})`)
      : ["- (нет)"]),
  ];
  return lines.join("\n");
}
