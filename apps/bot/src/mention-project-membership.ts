import type { Api } from "grammy";
import type { Context } from "grammy";
import type { ApiTask, ApiUser } from "./api";
import {
  fetchProjectMembers,
  fetchProjects,
  fetchTaskById,
  fetchUsers,
} from "./api";
import type {
  ResolvedAddTaskComment,
  ResolvedIntent,
  ResolvedMentionInTask,
} from "./intent-resolver";
import { replyWithIntentPreview } from "./intent-preview";
import { clearPendingConfirmation, setPendingConfirmation } from "./pending-intent";
import type { MentionAddToProjectFlow } from "./pending-mention-add-to-project";
import {
  clearPendingMentionAddToProject,
  setPendingMentionAddToProject,
} from "./pending-mention-add-to-project";
import { buildMentionAddToProjectKeyboard } from "./telegram/keyboards/mention-add-to-project-keyboard";
import { startPendingTaskMentionDetails } from "./task-mention-flow";
import { executeMentionInTask } from "./task-mention-flow";
import { executeTaskComment } from "./task-comment-flow";
import {
  getPendingMentionAddToProject,
} from "./pending-mention-add-to-project";

export type MentionMembershipContinuation = "preview" | "execute" | "awaiting_text";

/** Display name for mention membership messages. */
export function mentionDisplayName(user: ApiUser): string {
  const fullName = user.fullName?.trim();
  if (fullName) return fullName;
  const username = user.telegramUsername?.trim();
  if (username) return username.startsWith("@") ? username : `@${username}`;
  return "сотрудник";
}

export function resolvedHasMention(
  resolved: ResolvedIntent,
): resolved is ResolvedMentionInTask | ResolvedAddTaskComment {
  if (resolved.intent === "mention_in_task") return true;
  if (resolved.intent === "add_task_comment" && resolved.mentionedUserId) return true;
  return false;
}

function projectContextFromTask(task: ApiTask): { projectId: string; projectName: string } | null {
  const projectId = task.project?.id?.trim();
  if (!projectId) return null;
  const projectName = task.project?.name?.trim() || "проект";
  return { projectId, projectName };
}

export function formatNotInProjectMessage(mentionedUser: ApiUser, projectName: string): string {
  return `${mentionDisplayName(mentionedUser)} не добавлен в проект «${projectName}».`;
}

function formatAddToProjectQuestion(mentionedUser: ApiUser, projectName: string): string {
  return `${formatNotInProjectMessage(mentionedUser, projectName)} Хотите добавить его в проект?`;
}


async function isUserProjectMember(
  projectId: string,
  userId: string,
  actorUserId: string,
): Promise<boolean> {
  const members = await fetchProjectMembers(projectId, actorUserId);
  return members.some((m) => m.userId === userId);
}

function actorCanOfferAddToProject(
  actor: ApiUser,
  projectId: string,
  accessibleProjectIds: Set<string>,
): boolean {
  if (actor.role === "OWNER") return true;
  if (actor.role === "MANAGER") return accessibleProjectIds.has(projectId);
  return false;
}

async function loadAccessibleProjectIds(actorUserId: string): Promise<Set<string>> {
  const projects = await fetchProjects(actorUserId);
  return new Set(projects.map((p) => p.id));
}

/**
 * Ensures mentioned user is a project member before mention flow continues.
 * Returns true if caller should proceed; false if error or add-to-project prompt was shown.
 */
export async function gateMentionProjectMembership(
  ctx: Context,
  telegramUserId: number,
  actor: ApiUser,
  task: ApiTask,
  mentionedUser: ApiUser,
  resolved: ResolvedMentionInTask | ResolvedAddTaskComment,
  flow: MentionAddToProjectFlow,
  continuation: MentionMembershipContinuation,
): Promise<boolean> {
  const projectCtx = projectContextFromTask(task);
  if (!projectCtx) {
    await ctx.reply("Не удалось определить проект задачи.");
    return false;
  }

  const { projectId, projectName } = projectCtx;

  let isMember: boolean;
  try {
    isMember = await isUserProjectMember(projectId, mentionedUser.id, actor.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
    return false;
  }

  if (isMember) return true;

  const accessibleIds = await loadAccessibleProjectIds(actor.id);
  if (!actorCanOfferAddToProject(actor, projectId, accessibleIds)) {
    await ctx.reply(formatNotInProjectMessage(mentionedUser, projectName));
    return false;
  }

  const commentText =
    resolved.intent === "mention_in_task" ? resolved.text : resolved.text;

  clearPendingMentionAddToProject(telegramUserId);

  const choiceId = setPendingMentionAddToProject(telegramUserId, {
    taskId: task.id,
    projectId,
    projectName,
    mentionedUserId: mentionedUser.id,
    mentionedUserName: mentionDisplayName(mentionedUser),
    commentText,
    flow,
    continuation,
    resolved,
    actorUserId: actor.id,
  });

  await ctx.reply(formatAddToProjectQuestion(mentionedUser, projectName), {
    reply_markup: buildMentionAddToProjectKeyboard(telegramUserId, choiceId),
  });
  return false;
}

/** Re-fetch task and verify mentioned user before creating mention comment. */
export async function refreshResolvedTaskForMention(
  actorUserId: string,
  resolved: ResolvedMentionInTask | ResolvedAddTaskComment,
): Promise<
  | { ok: true; task: NonNullable<Awaited<ReturnType<typeof fetchTaskById>>> }
  | { ok: false; message: string }
> {
  const task = await fetchTaskById(resolved.taskId, actorUserId);
  if (!task) {
    return { ok: false, message: "Задача не найдена или больше недоступна." };
  }

  const users = await fetchUsers();
  const mentionedUser = users.find((u) => u.id === resolved.mentionedUserId);
  if (!mentionedUser) {
    return { ok: false, message: "Сотрудник не найден в организации." };
  }

  const projectId = task.project?.id;
  if (!projectId) {
    return { ok: false, message: "Не удалось определить проект задачи." };
  }

  const isMember = await isUserProjectMember(projectId, mentionedUser.id, actorUserId);
  if (!isMember) {
    const projectName = task.project?.name?.trim() || "проект";
    return {
      ok: false,
      message: formatNotInProjectMessage(mentionedUser, projectName),
    };
  }

  return { ok: true, task };
}

function syncResolvedWithTask(
  resolved: ResolvedMentionInTask | ResolvedAddTaskComment,
  task: NonNullable<Awaited<ReturnType<typeof fetchTaskById>>>,
): ResolvedMentionInTask | ResolvedAddTaskComment {
  const projectName = task.project?.name ?? resolved.projectName;
  if (resolved.intent === "mention_in_task") {
    return {
      ...resolved,
      taskTitle: task.title,
      projectName,
      creatorId: task.creatorId,
      assigneeId: task.assigneeId,
    };
  }
  return {
    ...resolved,
    taskTitle: task.title,
    projectName,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId ?? null,
  };
}

export async function executeMentionResolved(
  api: Api,
  actor: ApiUser,
  resolved: ResolvedMentionInTask | ResolvedAddTaskComment,
): Promise<string> {
  const refreshed = await refreshResolvedTaskForMention(actor.id, resolved);
  if (!refreshed.ok) return refreshed.message;

  const synced = syncResolvedWithTask(resolved, refreshed.task);
  if (synced.intent === "mention_in_task") {
    return executeMentionInTask(api, actor, synced);
  }
  return executeTaskComment(api, actor, synced);
}

export async function continueMentionFlowAfterAddToProject(
  ctx: Context,
  telegramUserId: number,
  actor: ApiUser,
  pending: import("./pending-mention-add-to-project").PendingMentionAddToProject,
): Promise<void> {
  const refreshed = await refreshResolvedTaskForMention(actor.id, pending.resolved);
  if (!refreshed.ok) {
    await ctx.reply(refreshed.message);
    return;
  }

  const synced = syncResolvedWithTask(pending.resolved, refreshed.task);

  if (pending.continuation === "awaiting_text") {
    const users = await fetchUsers();
    const mentionedUser = users.find((u) => u.id === pending.mentionedUserId);
    if (!mentionedUser) {
      await ctx.reply("Сотрудник не найден. Повторите команду.");
      return;
    }

    const question = startPendingTaskMentionDetails(
      telegramUserId,
      refreshed.task,
      mentionedUser,
    );
    await ctx.reply(question);
    return;
  }

  if (pending.continuation === "preview") {
    const intent =
      pending.flow === "mention_in_task"
        ? {
            intent: "mention_in_task" as const,
            confidence: 1,
            requiresConfirmation: true,
            payload: {
              userHint: pending.mentionedUserName,
              taskTitle: synced.taskTitle,
              text: synced.text,
            },
          }
        : {
            intent: "add_task_comment" as const,
            confidence: 1,
            requiresConfirmation: true,
            payload: {
              taskTitle: synced.taskTitle,
              comment: synced.text,
              mentionedUserId: synced.mentionedUserId,
            },
          };

    setPendingConfirmation(telegramUserId, {
      type: "ai_intent",
      intent,
      resolved: synced,
    });
    await replyWithIntentPreview(ctx, telegramUserId, synced);
    return;
  }

  try {
    const reply = await executeMentionResolved(ctx.api, actor, synced);
    await ctx.reply(reply);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
}

export async function tryExecuteMentionWithMembershipGate(
  ctx: Context,
  telegramUserId: number,
  actor: ApiUser,
  resolved: ResolvedMentionInTask | ResolvedAddTaskComment,
): Promise<boolean> {
  const task = await fetchTaskById(resolved.taskId, actor.id);
  if (!task) {
    await ctx.reply("Задача не найдена или больше недоступна.");
    return true;
  }

  const users = await fetchUsers();
  const mentionedUser = users.find((u) => u.id === resolved.mentionedUserId);
  if (!mentionedUser) {
    await ctx.reply("Сотрудник не найден. Повторите команду.");
    return true;
  }

  const flow: MentionAddToProjectFlow =
    resolved.intent === "mention_in_task" ? "mention_in_task" : "add_task_comment";

  const canProceed = await gateMentionProjectMembership(
    ctx,
    telegramUserId,
    actor,
    task,
    mentionedUser,
    resolved,
    flow,
    "execute",
  );

  if (!canProceed) {
    if (!getPendingMentionAddToProject(telegramUserId)) {
      clearPendingConfirmation(telegramUserId);
    }
    return true;
  }

  clearPendingConfirmation(telegramUserId);
  try {
    const reply = await executeMentionResolved(ctx.api, actor, resolved);
    await ctx.reply(reply);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.reply(msg.startsWith("Не удалось") ? msg : `Ошибка API: ${msg}`);
  }
  return true;
}

export function formatAddToProjectCancelMessageForName(mentionedUserName: string): string {
  return `Ок, не добавляю ${mentionedUserName} в проект.`;
}
