import type { ApiUser, UserNameMatchResult } from "./api";
import { isSelfHint, resolveUsersByHint, SELF_HINT_MARKER } from "./resolve-users-by-hint";

export type ResolveUserFromAiPayloadParams = {
  users: ApiUser[];
  userId?: string;
  hint?: string;
  currentUser: ApiUser | null;
};

/**
 * Разрешает сотрудника из AI payload: сначала userId (если валиден), иначе hint resolver.
 */
export function resolveUserFromAiPayload(
  params: ResolveUserFromAiPayloadParams,
): UserNameMatchResult {
  const { users, userId, hint, currentUser } = params;

  const trimmedHint = hint?.trim();
  if (
    trimmedHint &&
    (trimmedHint === SELF_HINT_MARKER || isSelfHint(trimmedHint))
  ) {
    if (!currentUser) return { kind: "none" };
    return { kind: "one", user: currentUser };
  }

  const trimmedUserId = userId?.trim();
  if (trimmedUserId === SELF_HINT_MARKER) {
    if (!currentUser) return { kind: "none" };
    return { kind: "one", user: currentUser };
  }

  if (trimmedUserId) {
    const user = users.find((entry) => entry.id === trimmedUserId);
    if (user) {
      console.log(`[ai-user-resolve] used userId ${trimmedUserId}`);
      return { kind: "one", user };
    }
    console.log(`[ai-user-resolve] invalid userId ${trimmedUserId}, fallback to hint resolver`);
  }

  if (trimmedHint) {
    return resolveUsersByHint(users, trimmedHint, currentUser);
  }

  return { kind: "none" };
}

export function resolveUserFromAiPayloadToUser(
  params: ResolveUserFromAiPayloadParams,
): ApiUser | undefined {
  const result = resolveUserFromAiPayload(params);
  if (result.kind === "one") return result.user;
  return undefined;
}
