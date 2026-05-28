import { redirect } from "next/navigation";
import { apiGet } from "@/lib/api";
import {
  pickDefaultActorUserId,
  readActorUserIdFromSearchParams,
} from "@/lib/actor-user";
import type { ApiUser } from "@/lib/types";

export type ResolvedProjectActor = {
  actorUserId: string;
  users: ApiUser[];
};

/** Redirects to default actor when missing; loads users once for selector. */
export async function resolveAppActor(
  searchParams: Record<string, string | string[] | undefined>,
  redirectPath: string,
): Promise<ResolvedProjectActor> {
  const users = await apiGet<ApiUser[]>("/users");
  const defaultActor = pickDefaultActorUserId(users);
  if (!defaultActor) {
    return { actorUserId: "", users };
  }

  const actorUserId = readActorUserIdFromSearchParams(searchParams);
  if (!actorUserId) {
    redirect(`${redirectPath}?actorUserId=${encodeURIComponent(defaultActor)}`);
  }

  return { actorUserId, users };
}

/** @deprecated Use resolveAppActor */
export const resolveProjectActor = resolveAppActor;
