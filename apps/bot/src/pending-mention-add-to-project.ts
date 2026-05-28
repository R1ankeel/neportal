import type { ResolvedAddTaskComment, ResolvedMentionInTask } from "./intent-resolver";
import { createCallbackId } from "./callback-id";

export type MentionAddToProjectFlow = "mention_in_task" | "add_task_comment";

export type MentionAddToProjectContinuation = "preview" | "execute" | "awaiting_text";

export type PendingMentionAddToProject = {
  type: "awaiting_mention_add_to_project";
  choiceId: string;
  taskId: string;
  projectId: string;
  projectName: string;
  mentionedUserId: string;
  mentionedUserName: string;
  commentText: string;
  flow: MentionAddToProjectFlow;
  continuation: MentionAddToProjectContinuation;
  resolved: ResolvedMentionInTask | ResolvedAddTaskComment;
  actorUserId: string;
  createdAt: number;
};

const pendingByTelegramUserId = new Map<number, PendingMentionAddToProject>();

export const PENDING_MENTION_ADD_TO_PROJECT_TTL_MS = 30 * 60 * 1000;

export function getPendingMentionAddToProject(
  telegramUserId: number,
): PendingMentionAddToProject | undefined {
  return pendingByTelegramUserId.get(telegramUserId);
}

export function setPendingMentionAddToProject(
  telegramUserId: number,
  pending: Omit<PendingMentionAddToProject, "choiceId" | "type" | "createdAt">,
): string {
  const choiceId = createCallbackId();
  pendingByTelegramUserId.set(telegramUserId, {
    ...pending,
    type: "awaiting_mention_add_to_project",
    choiceId,
    createdAt: Date.now(),
  });
  return choiceId;
}

export function clearPendingMentionAddToProject(telegramUserId: number): void {
  pendingByTelegramUserId.delete(telegramUserId);
}

export function isPendingMentionAddToProjectExpired(
  pending: PendingMentionAddToProject,
): boolean {
  return Date.now() - pending.createdAt > PENDING_MENTION_ADD_TO_PROJECT_TTL_MS;
}
