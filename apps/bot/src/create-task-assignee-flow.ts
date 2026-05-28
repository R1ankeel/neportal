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
import { resolveProjectFromHint } from "./hint-matchers";

export function questionForCreateTaskAssignee(title: string): string {
  return `Кому назначить задачу «${title}»?\n\nНапишите имя сотрудника или «мне».`;
}

export function questionForCreateTaskAssigneeWithButtons(params: {
  title: string;
  withEmployeeList: boolean;
}): string {
  if (params.withEmployeeList) {
    return `Кому назначить задачу «${params.title}»?\n\nВыберите сотрудника кнопкой или напишите имя текстом.`;
  }
  return `Кому назначить задачу «${params.title}»?\n\nНажмите «👤 Мне» или напишите имя сотрудника текстом.`;
}

export const CREATE_TASK_ASSIGNEE_OPEN_REPLY =
  "Напишите имя сотрудника или «мне».";

export async function confirmCreateTaskWithAssigneeId(
  ctx: Context,
  telegramUserId: number,
  pending: PendingCreateTaskAssignee,
  assigneeId: string,
): Promise<void> {
  const projects = await fetchProjects(pending.creatorId);
  const projectResult = resolveProjectFromHint(projects, pending.projectHint);
  if (projectResult.kind === "not_found" || projectResult.kind === "ambiguous") {
    await ctx.reply(projectResult.message);
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
