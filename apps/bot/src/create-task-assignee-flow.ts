import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import { fetchProjects } from "./api";
import { replyWithIntentPreview } from "./intent-preview";
import {
  resolveIntent,
  type ResolveIntentOverrides,
} from "./intent-resolver";
import { setPendingConfirmation } from "./pending-intent";
import type { PendingCreateTaskAssignee } from "./pending-create-task-assignee";
import { findProjectByHint } from "./hint-matchers";

export function questionForCreateTaskAssignee(title: string): string {
  return `Кому назначить задачу «${title}»?\n\nНапишите имя сотрудника или «мне».`;
}

export const CREATE_TASK_ASSIGNEE_OPEN_REPLY =
  "Напишите имя сотрудника или «мне».";

export async function confirmCreateTaskWithAssigneeId(
  ctx: Context,
  telegramUserId: number,
  pending: PendingCreateTaskAssignee,
  assigneeId: string,
): Promise<void> {
  const projects = await fetchProjects();
  const project = findProjectByHint(projects, pending.projectHint);
  if (!project) {
    await ctx.reply("Нет проектов. Сначала создайте проект в Web.");
    return;
  }

  const overrides: ResolveIntentOverrides = { assigneeId };
  const syntheticIntent: AiIntent = {
    intent: "create_task",
    confidence: 1,
    requiresConfirmation: true,
    payload: {
      title: pending.title,
      description: pending.description,
      deadlineDate: pending.deadlineDate,
      projectHint: pending.projectHint,
    },
  };

  const resolvedResult = await resolveIntent(
    syntheticIntent,
    telegramUserId,
    undefined,
    overrides,
  );
  if (!resolvedResult.ok) {
    await ctx.reply(resolvedResult.message);
    return;
  }

  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent: syntheticIntent,
    resolved: resolvedResult.resolved,
  });
  await replyWithIntentPreview(ctx, telegramUserId, resolvedResult.resolved);
}
