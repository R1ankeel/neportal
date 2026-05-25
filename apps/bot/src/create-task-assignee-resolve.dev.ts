import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import {
  createTaskAssigneeNeedsClarification,
  resolveCreateTaskAssigneeInIntent,
} from "./create-task-assignee-resolve";
import { devLog } from "./dev-log";
import { SELF_HINT_MARKER } from "./resolve-users-by-hint";

const CURRENT_USER: ApiUser = {
  id: "user-self-001",
  fullName: "Тестовый Пользователь",
  role: "EMPLOYEE",
};

function makeCreateTaskIntent(
  payload: Partial<Extract<AiIntent, { intent: "create_task" }>["payload"]>,
): Extract<AiIntent, { intent: "create_task" }> {
  return {
    intent: "create_task",
    confidence: 0.9,
    requiresConfirmation: true,
    payload: {
      title: "Подготовить сводный отчет",
      ...payload,
    },
  };
}

function devCheckSelfUserIdNoClarification(): void {
  const intent = makeCreateTaskIntent({ assigneeUserId: SELF_HINT_MARKER });
  const needsBefore = createTaskAssigneeNeedsClarification(intent.payload);
  const resolved = resolveCreateTaskAssigneeInIntent(intent, CURRENT_USER);
  const needsAfter = createTaskAssigneeNeedsClarification(resolved.payload);
  const ok =
    needsBefore === false &&
    needsAfter === false &&
    resolved.payload.assigneeUserId === CURRENT_USER.id;
  devLog(`create_task __self__ userId no clarification ${ok ? "OK" : "FAIL"}`, {
    needsBefore,
    needsAfter,
    assigneeUserId: resolved.payload.assigneeUserId,
  });
}

function devCheckSelfResolvesToCurrentUser(): void {
  const intent = makeCreateTaskIntent({ assigneeUserId: SELF_HINT_MARKER });
  const resolved = resolveCreateTaskAssigneeInIntent(intent, CURRENT_USER);
  const ok = resolved.payload.assigneeUserId === CURRENT_USER.id;
  devLog(`create_task __self__ resolves to current user ${ok ? "OK" : "FAIL"}`, {
    assigneeUserId: resolved.payload.assigneeUserId,
  });
}

function devCheckExplicitAssigneeUnchanged(): void {
  const explicitId = "user-masha-42";
  const intent = makeCreateTaskIntent({
    assigneeUserId: explicitId,
    assigneeHint: "Маша",
  });
  const resolved = resolveCreateTaskAssigneeInIntent(intent, CURRENT_USER);
  const ok =
    resolved.payload.assigneeUserId === explicitId &&
    resolved.payload.assigneeHint === "Маша";
  devLog(`create_task explicit assignee unchanged ${ok ? "OK" : "FAIL"}`, {
    assigneeUserId: resolved.payload.assigneeUserId,
    assigneeHint: resolved.payload.assigneeHint,
  });
}

function devCheckMissingAssigneeNeedsClarification(): void {
  const intent = makeCreateTaskIntent({});
  const ok = createTaskAssigneeNeedsClarification(intent.payload);
  devLog(`create_task missing assignee needs clarification ${ok ? "OK" : "FAIL"}`, {});
}

function devCheckSelfHintNoClarification(): void {
  const intent = makeCreateTaskIntent({ assigneeHint: SELF_HINT_MARKER });
  const ok = createTaskAssigneeNeedsClarification(intent.payload) === false;
  devLog(`create_task __self__ hint no clarification ${ok ? "OK" : "FAIL"}`, {});
}

function devCheckSelfHintResolvesOnRoute(): void {
  const intent = makeCreateTaskIntent({ assigneeHint: SELF_HINT_MARKER });
  const resolved = resolveCreateTaskAssigneeInIntent(intent, CURRENT_USER);
  const ok = resolved.payload.assigneeUserId === CURRENT_USER.id;
  devLog(`create_task __self__ hint resolves to id ${ok ? "OK" : "FAIL"}`, {
    assigneeUserId: resolved.payload.assigneeUserId,
  });
}

export function devLogCreateTaskAssigneeResolveChecks(): void {
  devLog("create_task assignee resolve self-checks");
  devCheckSelfUserIdNoClarification();
  devCheckSelfResolvesToCurrentUser();
  devCheckExplicitAssigneeUnchanged();
  devCheckMissingAssigneeNeedsClarification();
  devCheckSelfHintNoClarification();
  devCheckSelfHintResolvesOnRoute();
}
