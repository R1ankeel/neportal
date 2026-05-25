import type { Context } from "grammy";
import { fetchMyTasks, fetchUsers, type ApiMyTask, type ApiUser } from "./api";
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

export const ONLY_OWN_TASKS_MESSAGE = "Вы можете смотреть только свои задачи.";

export function canViewOtherUsersTasks(user: ApiUser): boolean {
  return user.role === "OWNER" || user.role === "MANAGER";
}

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

export function formatTasksList(
  tasks: ApiMyTask[],
  options: { forSelf: boolean; employeeName: string },
): string {
  if (tasks.length === 0) {
    return options.forSelf
      ? "У вас нет активных задач."
      : `У сотрудника ${options.employeeName} нет активных задач.`;
  }

  const header = options.forSelf
    ? "Ваши ближайшие задачи:"
    : `Ближайшие задачи сотрудника ${options.employeeName}:`;

  const lines = [header, ""];
  tasks.forEach((task, index) => {
    const projectName = task.project?.name ?? "—";
    lines.push(
      `${index + 1}. ${task.title}`,
      `   Проект: ${projectName}`,
      `   Дедлайн: ${formatTaskDeadlineForList(task.deadlineAt)}`,
      `   Статус: ${taskStatusLabel(task.status)}`,
    );
    if (index < tasks.length - 1) {
      lines.push("");
    }
  });
  return lines.join("\n");
}

export async function formatTasksReply(
  userId: string,
  employeeName: string,
  forSelf: boolean,
  limit = 5,
): Promise<string> {
  const tasks = await fetchMyTasks(userId, limit);
  return formatTasksList(tasks, { forSelf, employeeName });
}

/** @deprecated Use formatTasksReply with forSelf: true */
export function formatMyTasksList(tasks: ApiMyTask[]): string {
  return formatTasksList(tasks, { forSelf: true, employeeName: "" });
}

export async function formatMyTasksReply(userId: string, limit = 5): Promise<string> {
  return formatTasksReply(userId, "", true, limit);
}

export async function replyWithTasksForUser(
  ctx: Context,
  targetUser: ApiUser,
  forSelf: boolean,
  limit = 5,
): Promise<void> {
  const reply = await formatTasksReply(
    targetUser.id,
    targetUser.fullName,
    forSelf,
    limit,
  );
  await ctx.reply(reply);
}

/** Slash / AI: показать задачи по подсказке имени (или свои при self-hint). */
export async function replyWithTasksForHint(
  ctx: Context,
  currentUser: ApiUser,
  telegramUserId: number,
  hint: string,
  limit = 5,
  userId?: string,
): Promise<void> {
  const trimmed = hint.trim();
  if (!trimmed && !userId) {
    await replyWithTasksForUser(ctx, currentUser, true, limit);
    return;
  }

  if (trimmed && isSelfUserHint(trimmed)) {
    await replyWithTasksForUser(ctx, currentUser, true, limit);
    return;
  }

  if (!canViewOtherUsersTasks(currentUser)) {
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
    const payload: TaskListUserSelectionPayload = { intent: "task_list", limit };
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

  await replyWithTasksForUser(ctx, match.user, false, limit);
}
