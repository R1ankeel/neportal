import type { Context } from "grammy";
import type { AiIntent } from "./ai-contracts";
import type { ApiProject } from "./api";
import { beginCreateExpenseFlow } from "./create-expense-flow";
import {
  createTaskAssigneeNeedsClarification,
  resolveCreateTaskAssigneeInIntent,
} from "./create-task-assignee-resolve";
import {
  confirmCreateTaskWithAssigneeId,
  questionForCreateTaskAssigneeWithButtons,
} from "./create-task-assignee-flow";
import { replyWithIntentPreview } from "./intent-preview";
import { resolveIntent } from "./intent-resolver";
import { setPendingConfirmation } from "./pending-intent";
import type { CreateTaskAssigneeCandidate } from "./pending-create-task-assignee";
import { startPendingCreateTaskAssignee } from "./pending-create-task-assignee";
import type { ProjectSelectionContinue } from "./pending-project-selection";
import { tryHandleAmbiguousUserHintBeforeResolve } from "./user-hint-resolution";
import { fetchUsers } from "./api";
import { replyWithActiveChoiceKeyboard } from "./choice-reply";
import { getLinkedUserByTelegramId, NOT_LINKED_MESSAGE } from "./current-user";

const CREATE_TASK_ASSIGNEE_LIST_LIMIT = 7;

function withProjectHint(intent: AiIntent, projectName: string): AiIntent {
  switch (intent.intent) {
    case "create_task":
      return {
        ...intent,
        payload: { ...intent.payload, projectHint: projectName },
      };
    case "create_budget":
      return {
        ...intent,
        payload: { ...intent.payload, projectHint: projectName },
      };
    case "create_expense":
      return {
        ...intent,
        payload: { ...intent.payload, projectHint: projectName },
      };
    default:
      return intent;
  }
}

async function continueCreateTaskAfterProject(
  ctx: Context,
  linked: Awaited<ReturnType<typeof getLinkedUserByTelegramId>>,
  telegramUserId: number,
  intent: Extract<AiIntent, { intent: "create_task" }>,
  userText?: string,
): Promise<void> {
  if (!linked) {
    await ctx.reply(NOT_LINKED_MESSAGE);
    return;
  }

  let activeIntent = resolveCreateTaskAssigneeInIntent(intent, linked);
  if (createTaskAssigneeNeedsClarification(activeIntent.payload)) {
    const allUsers = await fetchUsers();
    const employeeCandidates = allUsers.filter((u) => u.id !== linked.id);
    const withEmployeeList =
      employeeCandidates.length > 0 && employeeCandidates.length <= CREATE_TASK_ASSIGNEE_LIST_LIMIT;
    const candidates: CreateTaskAssigneeCandidate[] = [{ kind: "self" }];
    if (withEmployeeList) {
      for (const user of employeeCandidates) {
        candidates.push({ kind: "user", userId: user.id, label: user.fullName });
      }
    }

    startPendingCreateTaskAssignee(telegramUserId, {
      candidates,
      projectHint: activeIntent.payload.projectHint,
      title: activeIntent.payload.title,
      description: activeIntent.payload.description,
      deadlineDate: activeIntent.payload.deadlineDate,
      creatorId: linked.id,
    });

    await replyWithActiveChoiceKeyboard(
      ctx,
      telegramUserId,
      questionForCreateTaskAssigneeWithButtons({
        title: activeIntent.payload.title,
        withEmployeeList,
      }),
    );
    return;
  }

  const users = await fetchUsers();
  if (await tryHandleAmbiguousUserHintBeforeResolve(ctx, linked, telegramUserId, activeIntent, users)) {
    return;
  }

  const resolvedResult = await resolveIntent(activeIntent, telegramUserId, userText);
  if (!resolvedResult.ok) {
    await ctx.reply(resolvedResult.message);
    return;
  }

  setPendingConfirmation(telegramUserId, {
    type: "ai_intent",
    intent: activeIntent,
    resolved: resolvedResult.resolved,
  });
  await replyWithIntentPreview(ctx, telegramUserId, resolvedResult.resolved);
}

export async function continueAfterProjectSelection(
  ctx: Context,
  telegramUserId: number,
  project: ApiProject,
  continuation: ProjectSelectionContinue,
): Promise<void> {
  const linked = await getLinkedUserByTelegramId(telegramUserId);
  if (!linked) {
    await ctx.reply(NOT_LINKED_MESSAGE);
    return;
  }

  switch (continuation.kind) {
    case "ai_intent": {
      const intent = withProjectHint(continuation.intent, project.name);
      if (intent.intent === "create_expense") {
        await beginCreateExpenseFlow(ctx, telegramUserId, linked, {
          amount: intent.payload.amount,
          description: intent.payload.description,
          projectHint: project.name,
          budgetHint: intent.payload.budgetHint,
          executeIfResolved: false,
        });
        return;
      }
      if (intent.intent === "create_task") {
        await continueCreateTaskAfterProject(ctx, linked, telegramUserId, intent, continuation.userText);
        return;
      }
      if (intent.intent === "create_budget") {
        const resolvedResult = await resolveIntent(intent, telegramUserId, continuation.userText);
        if (!resolvedResult.ok) {
          await ctx.reply(resolvedResult.message);
          return;
        }
        setPendingConfirmation(telegramUserId, {
          type: "ai_intent",
          intent,
          resolved: resolvedResult.resolved,
        });
        await replyWithIntentPreview(ctx, telegramUserId, resolvedResult.resolved);
        return;
      }
      await ctx.reply("Не удалось продолжить действие. Повторите команду.");
      return;
    }

    case "create_task_assignee": {
      const pending = {
        ...continuation.data,
        projectHint: project.name,
      };
      if (continuation.data.candidates.length === 1 && continuation.data.candidates[0]?.kind === "self") {
        await confirmCreateTaskWithAssigneeId(ctx, telegramUserId, pending, linked.id);
        return;
      }
      startPendingCreateTaskAssignee(telegramUserId, pending);
      const withEmployeeList = continuation.data.candidates.some((c) => c.kind === "user");
      await replyWithActiveChoiceKeyboard(
        ctx,
        telegramUserId,
        questionForCreateTaskAssigneeWithButtons({
          title: continuation.data.title,
          withEmployeeList,
        }),
      );
      return;
    }

    case "slash_task": {
      const syntheticIntent: AiIntent = {
        intent: "create_task",
        confidence: 1,
        requiresConfirmation: true,
        payload: {
          title: continuation.title,
          projectHint: project.name,
        },
      };
      const overrides = continuation.assigneeId
        ? { assigneeId: continuation.assigneeId }
        : undefined;
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
      return;
    }

    case "slash_expense": {
      await beginCreateExpenseFlow(ctx, telegramUserId, linked, {
        amount: continuation.amount,
        description: continuation.description,
        projectHint: project.name,
        budgetHint: continuation.budgetHint,
        executeIfResolved: continuation.executeIfResolved,
      });
      return;
    }
  }
}
