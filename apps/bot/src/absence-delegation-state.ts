import type { Context } from "grammy";
import type { ApiUser } from "./api";
import {
  formatDistributionSummary,
  formatItemAssigneeQuestion,
} from "./absence-delegation-format";
import {
  clearPendingAbsenceDelegation,
  startPendingAbsenceDelegationItemAssignee,
  type AbsenceDelegationAssignment,
  type AbsenceDelegationContext,
  type PendingAbsenceDelegationItemAssignee,
} from "./pending-absence-delegation";
import { setPendingConfirmation } from "./pending-intent";

const KEEP_ITEM_RE =
  /^(?:мне|оставить(?:\s+себе)?|оставить\s+за\s+собой|за\s+мной|себе)$/iu;

const DISTRIBUTE_MODE_RE =
  /^(?:распределить|перераспределить|передать)$/iu;

const KEEP_ALL_MODE_RE =
  /^(?:оставить(?:\s+за\s+собой)?|мне|нет|не\s+надо)$/iu;

export function isDelegationKeepAllMode(text: string): boolean {
  const t = text.trim();
  return KEEP_ALL_MODE_RE.test(t);
}

export function isDelegationDistributeMode(text: string): boolean {
  const t = text.trim();
  return DISTRIBUTE_MODE_RE.test(t);
}

export function isDelegationKeepItemAnswer(text: string): boolean {
  const t = text.trim();
  return KEEP_ITEM_RE.test(t);
}

export function startItemDistribution(
  telegramUserId: number,
  ctx: AbsenceDelegationContext,
): void {
  startPendingAbsenceDelegationItemAssignee(telegramUserId, {
    ...ctx,
    index: 0,
    assignments: [],
  });
}

export async function advanceAfterAssignment(
  ctx: Context,
  telegramUserId: number,
  pending: PendingAbsenceDelegationItemAssignee,
  newAssignment: AbsenceDelegationAssignment,
): Promise<void> {
  const assignments = [...pending.assignments, newAssignment];
  const nextIndex = pending.index + 1;

  if (nextIndex >= pending.tasks.length) {
    clearPendingAbsenceDelegation(telegramUserId);
    setPendingConfirmation(telegramUserId, {
      type: "confirm_absence_delegation_distribution",
      absenceId: pending.absenceId,
      absenceUserId: pending.absenceUserId,
      absenceUserName: pending.absenceUserName,
      absenceType: pending.absenceType,
      startDate: pending.startDate,
      endDate: pending.endDate,
      tasks: pending.tasks,
      assignments,
    });
    await ctx.reply(formatDistributionSummary(pending.tasks, assignments));
    return;
  }

  startPendingAbsenceDelegationItemAssignee(telegramUserId, {
    absenceId: pending.absenceId,
    absenceUserId: pending.absenceUserId,
    absenceUserName: pending.absenceUserName,
    absenceType: pending.absenceType,
    startDate: pending.startDate,
    endDate: pending.endDate,
    tasks: pending.tasks,
    index: nextIndex,
    assignments,
  });

  const task = pending.tasks[nextIndex];
  await ctx.reply(
    formatItemAssigneeQuestion(task, nextIndex, pending.tasks.length),
  );
}

export function assignmentKeep(taskId: string): AbsenceDelegationAssignment {
  return { taskId, action: "KEEP" };
}

export function assignmentTransfer(
  taskId: string,
  user: ApiUser,
): AbsenceDelegationAssignment {
  return {
    taskId,
    action: "TRANSFER",
    toUserId: user.id,
    toUserName: user.fullName,
  };
}
