import {
  fetchMyTasks,
  fetchProjects,
  fetchTasks,
  fetchUsers,
  type ApiProject,
  type ApiUser,
} from "./api";
import type { PromptGroup } from "./ai/prompt-group-router";
import { loadPromptBudgetContext } from "./budget-context-cache";
import { normalizeName, parseSystemAliasesString, pickPromptAliases } from "@neportal/shared";
import { todayIsoDate } from "./parse-ru-date";

const MAX_TASKS_IN_CONTEXT = 20;
const MAX_TASKS_IN_PROMPT = 12;
const MAX_EMPLOYEES_WITH_ALIASES = 30;
const COMPACT_ALIASES_PER_EMPLOYEE = 5;
const EXPANDED_ALIASES_PER_EMPLOYEE = 8;

export type IntentPromptContext = {
  currentDate: string;
  projects: ApiProject[];
  users: ApiUser[];
  budgets: Array<{ title: string; projectName: string }>;
  tasks: Array<{ title: string; projectName: string }>;
};

export type PromptContextStats = {
  users: number;
  aliasCount: number;
  tasks: number;
  budgets: number;
  projects: number;
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

function normalizeForTaskFilter(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Сужает список задач в prompt по словам из userText (склад, отчет, …). */
export function filterTasksForPrompt(
  tasks: Array<{ title: string; projectName: string }>,
  userText?: string,
  max = MAX_TASKS_IN_PROMPT,
): Array<{ title: string; projectName: string }> {
  const slice = tasks.slice(0, max);
  const query = userText?.trim();
  if (!query) return slice;

  const normalized = normalizeForTaskFilter(query);
  const tokens = normalized
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !/^(задачу|задаче|задачи|задача|по|на|мне|меня)$/u.test(t));

  if (tokens.length === 0) return slice;

  const matched = tasks.filter((task) => {
    const title = normalizeForTaskFilter(task.title);
    return tokens.some((token) => title.includes(token) || token.includes(title));
  });

  if (matched.length === 0) return slice;
  return matched.slice(0, max);
}

function groupNeedsUsers(group: PromptGroup): boolean {
  return (
    group === "create-task-rich" ||
    group === "create-note" ||
    group === "absence" ||
    group === "task-list" ||
    group === "collaboration"
  );
}

export type LoadIntentPromptContextOptions = {
  linkedUserId?: string;
  /** Текст пользователя — для hint-based расширения aliases в prompt. */
  userText?: string;
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
    case "create-task-rich":
    case "create-note": {
      const [projects, users] = await Promise.all([fetchProjects(), fetchUsers()]);
      return { ...empty, projects, users };
    }
    case "expense": {
      const projects = await fetchProjects();
      const { rows: budgets } = await loadPromptBudgetContext(projects, {
        linkedUserId: options?.linkedUserId,
      });
      return { ...empty, projects, budgets };
    }
    case "absence":
    case "task-list": {
      const users = await fetchUsers();
      return { ...empty, users };
    }
    case "task-status": {
      const projects = await fetchProjects();
      const tasks = await loadActiveTasks(options?.linkedUserId, projects);
      return {
        ...empty,
        tasks: filterTasksForPrompt(tasks, options?.userText),
      };
    }
    case "collaboration": {
      const [projects, users] = await Promise.all([fetchProjects(), fetchUsers()]);
      const tasks = await loadActiveTasks(options?.linkedUserId, projects);
      return {
        ...empty,
        users,
        tasks: filterTasksForPrompt(tasks, options?.userText),
      };
    }
    case "classifier":
      return empty;
    default:
      return empty;
  }
}

function aliasMentionedInUserText(alias: string, userText: string): boolean {
  const a = normalizeName(alias);
  const t = normalizeName(userText);
  if (!a || !t) return false;
  if (t.includes(a) || a.includes(t)) return true;

  const minLen = Math.min(a.length, t.length);
  if (minLen < 3) return false;
  let common = 0;
  while (common < minLen && a[common] === t[common]) common++;
  return common >= 3;
}

/** Aliases для LLM: компактно, с расширением при упоминании в userText. */
export function pickAliasesForPrompt(user: ApiUser, userText?: string): string[] {
  const parsed = parseSystemAliasesString(user.systemAliases);
  if (parsed.length === 0) return [];

  const trimmedText = userText?.trim();
  if (!trimmedText) {
    return pickPromptAliases(user.systemAliases, COMPACT_ALIASES_PER_EMPLOYEE);
  }

  const mentioned = parsed.filter((alias) => aliasMentionedInUserText(alias, trimmedText));
  if (mentioned.length === 0) {
    return pickPromptAliases(user.systemAliases, COMPACT_ALIASES_PER_EMPLOYEE);
  }

  const rest = parsed.filter((alias) => !mentioned.includes(alias));
  return [...mentioned, ...rest].slice(0, EXPANDED_ALIASES_PER_EMPLOYEE);
}

export function countPromptContextStats(
  ctx: IntentPromptContext,
  userText?: string,
): PromptContextStats {
  let aliasCount = 0;
  for (const user of ctx.users) {
    aliasCount += pickAliasesForPrompt(user, userText).length;
  }
  return {
    users: ctx.users.length,
    aliasCount,
    tasks: ctx.tasks.length,
    budgets: ctx.budgets.length,
    projects: ctx.projects.length,
  };
}

export function formatPromptContextForModel(
  ctx: IntentPromptContext,
  group: PromptGroup,
  userText?: string,
): string {
  const lines: string[] = [`Текущая дата: ${ctx.currentDate}`];

  if (
    (group === "create-task-rich" || group === "create-note" || group === "expense") &&
    ctx.projects.length > 0
  ) {
    lines.push("", "Проекты:", ...ctx.projects.map((p) => `- ${p.name}`));
  }

  if (groupNeedsUsers(group) && ctx.users.length > 0) {
    lines.push("", "Сотрудники:", ...formatEmployeesForPrompt(ctx.users, userText));
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

function formatEmployeesForPrompt(users: ApiUser[], userText?: string): string[] {
  const includeAliases = users.length <= MAX_EMPLOYEES_WITH_ALIASES;

  return users.map((user) => {
    const username = user.telegramUsername
      ? `@${user.telegramUsername.replace(/^@+/, "")}`
      : "";
    const parts = [`id=${user.id}`, `name="${user.fullName}"`];
    if (username) parts.push(`username="${username}"`);
    if (includeAliases) {
      const aliases = pickAliasesForPrompt(user, userText);
      if (aliases.length > 0) {
        parts.push(`aliases="${aliases.join(", ")}"`);
      }
    }
    return `- ${parts.join("; ")}`;
  });
}
