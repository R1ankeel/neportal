import type { Context } from "grammy";
import { fetchCompletedTasks, fetchUsers, type ApiMyTask, type ApiUser } from "./api";
import {
  apiUserToCandidate,
  startPendingUserSelection,
  type CompletedTaskListUserSelectionPayload,
} from "./pending-user-selection";
import { formatIsoDateRu } from "./parse-ru-date";
import { resolveUserFromAiPayload } from "./resolve-user-from-ai-payload";
import { formatUserCandidates, userNotFoundMessage } from "./user-selection-format";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";
import {
  ONLY_OWN_TASKS_MESSAGE,
  isSelfUserHint,
} from "./my-tasks-flow";
import { canViewOtherMemberTasks } from "./task-read-access";

export function formatTaskCompletedAt(completedAt: string | null | undefined): string | null {
  if (!completedAt) return null;
  const iso = completedAt.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return formatIsoDateRu(iso);
  }
  return completedAt;
}

export function formatCompletedTasksList(
  tasks: ApiMyTask[],
  options: { forSelf: boolean; employeeName: string },
): string {
  if (tasks.length === 0) {
    return options.forSelf
      ? "У вас нет выполненных задач."
      : `У сотрудника ${options.employeeName} нет выполненных задач.`;
  }

  const header = options.forSelf
    ? "Ваши выполненные задачи:"
    : `Выполненные задачи сотрудника ${options.employeeName}:`;

  const lines = [header, ""];
  tasks.forEach((task, index) => {
    const projectName = task.project?.name ?? "—";
    lines.push(`${index + 1}. ${task.title}`, `Проект: ${projectName}`);
    const completedRu = formatTaskCompletedAt(task.completedAt);
    if (completedRu) {
      lines.push(`Завершена: ${completedRu}`);
    }
    const result = task.completionResult?.trim();
    if (result) {
      lines.push(`Результат: ${result}`);
    }
    if (index < tasks.length - 1) {
      lines.push("");
    }
  });
  return lines.join("\n");
}

export async function formatCompletedTasksReply(
  userId: string,
  employeeName: string,
  forSelf: boolean,
  limit = 5,
): Promise<string> {
  const tasks = await fetchCompletedTasks(userId, limit);
  return formatCompletedTasksList(tasks, { forSelf, employeeName });
}

export async function formatMyCompletedTasksReply(userId: string, limit = 5): Promise<string> {
  return formatCompletedTasksReply(userId, "", true, limit);
}

export async function replyWithCompletedTasksForUser(
  ctx: Context,
  targetUser: ApiUser,
  forSelf: boolean,
  limit = 5,
): Promise<void> {
  const reply = await formatCompletedTasksReply(
    targetUser.id,
    targetUser.fullName,
    forSelf,
    limit,
  );
  await ctx.reply(reply);
}

export async function replyWithCompletedTasksForHint(
  ctx: Context,
  currentUser: ApiUser,
  telegramUserId: number,
  hint: string,
  limit = 5,
  userId?: string,
): Promise<void> {
  const trimmed = hint.trim();
  if (!trimmed && !userId) {
    await replyWithCompletedTasksForUser(ctx, currentUser, true, limit);
    return;
  }

  if (trimmed && isSelfUserHint(trimmed)) {
    await replyWithCompletedTasksForUser(ctx, currentUser, true, limit);
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
    const payload: CompletedTaskListUserSelectionPayload = {
      intent: "completed_task_list",
      limit,
    };
    startPendingUserSelection(
      telegramUserId,
      "select_user_for_completed_task_list",
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

  await replyWithCompletedTasksForUser(ctx, match.user, false, limit);
}
