import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { devLog } from "./dev-log";
import { isSelfHint, SELF_HINT_MARKER } from "./resolve-users-by-hint";

export type CreateTaskIntent = Extract<AiIntent, { intent: "create_task" }>;

function payloadIsSelfAssignee(payload: CreateTaskIntent["payload"]): boolean {
  const userId = payload.assigneeUserId?.trim();
  if (userId === SELF_HINT_MARKER) return true;

  const hint = payload.assigneeHint?.trim();
  if (!hint) return false;
  return hint === SELF_HINT_MARKER || isSelfHint(hint);
}

/** Нужен ли уточняющий вопрос «Кому назначить задачу?» */
export function createTaskAssigneeNeedsClarification(
  payload: CreateTaskIntent["payload"],
): boolean {
  if (payload.assigneeHint?.trim()) return false;
  const userId = payload.assigneeUserId?.trim();
  if (!userId) return true;
  if (userId === SELF_HINT_MARKER) return false;
  return false;
}

/**
 * Резолвит assigneeUserId="__self__" (и self-hint) в id текущего пользователя
 * до проверки обязательных полей / clarification.
 */
export function resolveCreateTaskAssigneeInIntent(
  intent: CreateTaskIntent,
  currentUser: ApiUser,
): CreateTaskIntent {
  const payload = { ...intent.payload };
  const originalAssigneeUserId = payload.assigneeUserId;
  const originalAssigneeHint = payload.assigneeHint;
  const isSelfAssignee = payloadIsSelfAssignee(payload);

  let resolvedAssigneeUserId = payload.assigneeUserId;

  if (isSelfAssignee) {
    resolvedAssigneeUserId = currentUser.id;
    payload.assigneeUserId = currentUser.id;
  }

  devLog("create_task assignee before required-fields", {
    originalAssigneeUserId: originalAssigneeUserId ?? null,
    originalAssigneeHint: originalAssigneeHint ?? null,
    resolvedAssigneeUserId: resolvedAssigneeUserId ?? null,
    isSelfAssignee,
    currentUserId: currentUser.id,
    needsClarification: createTaskAssigneeNeedsClarification(payload),
  });

  return { ...intent, payload };
}
