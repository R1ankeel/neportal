import type { Context } from "grammy";
import {
  fetchMyTasks,
  fetchProjects,
  fetchUsers,
  MY_TASKS_LIST_MAX_LIMIT,
  type ApiMyTask,
  type ApiUser,
} from "./api";
import { resolveProjectFromHint } from "./hint-matchers";
import {
  apiUserToCandidate,
  startPendingUserSelection,
  type TaskListUserSelectionPayload,
} from "./pending-user-selection";
import { formatIsoDateRu } from "./parse-ru-date";
import { SELF_HINT_MARKER, isSelfHint } from "./resolve-users-by-hint";
import { resolveUserFromAiPayload } from "./resolve-user-from-ai-payload";
import { formatUserCandidates, userNotFoundMessage } from "./user-selection-format";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";
import { canViewOtherMemberTasks } from "./task-read-access";

export const ONLY_OWN_TASKS_MESSAGE = "Вы можете смотреть только свои задачи.";

/** Default limit for /tasks, list_my_tasks, and related flows (matches API cap). */
export const TASK_LIST_DISPLAY_LIMIT = MY_TASKS_LIST_MAX_LIMIT;

export const TASK_LIST_TRUNCATED_FOOTER = "Показаны ближайшие 20 задач.";

/**
 * @deprecated Используйте canViewOtherMemberTasks из task-read-access.ts.
 * Оставлено для совместимости с существующими импортами.
 */
export { canViewOtherMemberTasks as canViewOtherUsersTasks } from "./task-read-access";

export function isSelfUserHint(hint: string): boolean {
  const t = hint.trim();
  return t === SELF_HINT_MARKER || isSelfHint(t);
}

function localCalendarIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function deadlineCalendarIso(deadlineAt: string): string {
  const d = new Date(deadlineAt);
  return localCalendarIso(d);
}

/** Дедлайн для списка задач: сегодня / завтра / DD.MM.YYYY / не указан. */
export function formatTaskDeadlineForList(deadlineAt: string | null | undefined): string {
  if (!deadlineAt) return "не указан";

  const iso = deadlineCalendarIso(deadlineAt);
  const now = new Date();
  const today = localCalendarIso(now);
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrow = localCalendarIso(tomorrowDate);

  if (iso === today) return "сегодня";
  if (iso === tomorrow) return "завтра";
  return formatIsoDateRu(iso);
}

export function taskStatusLabel(status: string): string {
  switch (status) {
    case "NEW":
      return "Новая";
    case "IN_PROGRESS":
      return "В работе";
    default:
      return status;
  }
}

type TaskListFormatOptions = {
  forSelf: boolean;
  employeeName: string;
  /** When set, render a single project section (strict projectHint). */
  sectionProjectName?: string;
};

function groupTasksByProject(tasks: ApiMyTask[]): { name: string; tasks: ApiMyTask[] }[] {
  const byKey = new Map<string, { name: string; tasks: ApiMyTask[] }>();
  for (const task of tasks) {
    const key = task.project?.id ?? "";
    const name = task.project?.name ?? "—";
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.tasks.push(task);
    } else {
      byKey.set(key, { name, tasks: [task] });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ru", { sensitivity: "base" }),
  );
}

export function formatGroupedTasksList(
  tasks: ApiMyTask[],
  options: TaskListFormatOptions,
): string {
  if (tasks.length === 0) {
    return options.forSelf
      ? "У вас нет активных задач."
      : `У сотрудника ${options.employeeName} нет активных задач.`;
  }

  const header = options.forSelf
    ? "Ваши ближайшие задачи:"
    : `Ближайшие задачи сотрудника ${options.employeeName}:`;

  const lines: string[] = [header, ""];
  const sections = options.sectionProjectName
    ? [{ name: options.sectionProjectName, tasks }]
    : groupTasksByProject(tasks);

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex]!;
    lines.push(`Проект: ${section.name}`, "");
    section.tasks.forEach((task, index) => {
      lines.push(
        `${index + 1}. ${task.title}`,
        `   Дедлайн: ${formatTaskDeadlineForList(task.deadlineAt)}`,
        `   Статус: ${taskStatusLabel(task.status)}`,
      );
      if (index < section.tasks.length - 1) {
        lines.push("");
      }
    });
    if (sectionIndex < sections.length - 1) {
      lines.push("", "");
    }
  }

  if (tasks.length === TASK_LIST_DISPLAY_LIMIT) {
    lines.push("", TASK_LIST_TRUNCATED_FOOTER);
  }

  return lines.join("\n");
}

/** @deprecated Use formatGroupedTasksList */
export function formatTasksList(
  tasks: ApiMyTask[],
  options: { forSelf: boolean; employeeName: string },
): string {
  return formatGroupedTasksList(tasks, options);
}

export async function formatTasksReply(
  userId: string,
  employeeName: string,
  forSelf: boolean,
  limit = TASK_LIST_DISPLAY_LIMIT,
  projectResolverActorId?: string,
  projectHint?: string,
): Promise<string> {
  const cappedLimit = Math.min(Math.max(limit, 1), TASK_LIST_DISPLAY_LIMIT);
  const hintTrimmed = projectHint?.trim();
  if (hintTrimmed) {
    const actorId = projectResolverActorId ?? userId;
    const projects = await fetchProjects(actorId);
    const projectResult = resolveProjectFromHint(projects, hintTrimmed);
    if (projectResult.kind === "not_found" || projectResult.kind === "ambiguous") {
      return projectResult.message;
    }
    const tasks = await fetchMyTasks(userId, TASK_LIST_DISPLAY_LIMIT);
    const filtered = tasks.filter((t) => t.project?.id === projectResult.project.id);
    return formatGroupedTasksList(filtered, {
      forSelf,
      employeeName,
      sectionProjectName: projectResult.project.name,
    });
  }

  const tasks = await fetchMyTasks(userId, cappedLimit);
  return formatGroupedTasksList(tasks, { forSelf, employeeName });
}

/** @deprecated Use formatTasksReply with forSelf: true */
export function formatMyTasksList(tasks: ApiMyTask[]): string {
  return formatGroupedTasksList(tasks, { forSelf: true, employeeName: "" });
}

export async function formatMyTasksReply(
  userId: string,
  limit = TASK_LIST_DISPLAY_LIMIT,
  projectHint?: string,
): Promise<string> {
  return formatTasksReply(userId, "", true, limit, userId, projectHint);
}

export async function replyWithTasksForUser(
  ctx: Context,
  targetUser: ApiUser,
  forSelf: boolean,
  limit = TASK_LIST_DISPLAY_LIMIT,
  projectHint?: string,
  projectResolverActorId?: string,
): Promise<void> {
  const reply = await formatTasksReply(
    targetUser.id,
    targetUser.fullName,
    forSelf,
    limit,
    projectResolverActorId,
    projectHint,
  );
  await ctx.reply(reply);
}

/** Slash / AI: показать задачи по подсказке имени (или свои при self-hint). */
export async function replyWithTasksForHint(
  ctx: Context,
  currentUser: ApiUser,
  telegramUserId: number,
  hint: string,
  limit = TASK_LIST_DISPLAY_LIMIT,
  userId?: string,
  projectHint?: string,
): Promise<void> {
  const trimmed = hint.trim();
  if (!trimmed && !userId) {
    const reply = await formatMyTasksReply(currentUser.id, limit, projectHint);
    await ctx.reply(reply);
    return;
  }

  if (trimmed && isSelfUserHint(trimmed)) {
    const reply = await formatMyTasksReply(currentUser.id, limit, projectHint);
    await ctx.reply(reply);
    return;
  }

  if (!canViewOtherMemberTasks(currentUser)) {
    await ctx.reply(ONLY_OWN_TASKS_MESSAGE);
    return;
  }

  const users = await fetchUsers();
  const match = resolveUserFromAiPayload({
    users,
    userId,
    hint: trimmed || undefined,
    currentUser,
  });
  if (match.kind === "none") {
    await ctx.reply(userNotFoundMessage(trimmed));
    return;
  }
  if (match.kind === "many") {
    const payload: TaskListUserSelectionPayload = {
      intent: "task_list",
      limit,
      projectHint,
    };
    startPendingUserSelection(
      telegramUserId,
      "select_user_for_task_list",
      match.users.map(apiUserToCandidate),
      payload,
    );
    await replyWithActiveChoiceKeyboard(
      ctx,
      telegramUserId,
      formatUserCandidates(match.users.map(apiUserToCandidate)),
    );
    return;
  }

  const reply = await formatTasksReply(
    match.user.id,
    match.user.fullName,
    false,
    limit,
    currentUser.id,
    projectHint,
  );
  await ctx.reply(reply);
}
