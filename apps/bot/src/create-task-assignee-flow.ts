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
import { startProjectSelectionIfNeeded } from "./project-selection-flow";

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
  pending: Omit<PendingCreateTaskAssignee, "type" | "choiceId" | "createdAt">,
  assigneeId: string,
): Promise<void> {
  const projects = await fetchProjects(pending.creatorId);
  const project = await startProjectSelectionIfNeeded(
    ctx,
    telegramUserId,
    projects,
    pending.projectHint,
    {
      kind: "create_task_assignee",
      data: {
        candidates: pending.candidates,
        projectHint: pending.projectHint,
        title: pending.title,
        description: pending.description,
        deadlineDate: pending.deadlineDate,
        creatorId: pending.creatorId,
      },
    },
  );
  if (!project) {
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
      projectHint: project.name,
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
    intent: { ...syntheticIntent, payload: { ...syntheticIntent.payload, projectHint: project.name } },
    resolved: resolvedResult.resolved,
  });
  await replyWithIntentPreview(ctx, telegramUserId, resolvedResult.resolved);
}
