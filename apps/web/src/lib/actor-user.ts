import type { ApiUser } from "@/lib/types";

export function pickDefaultActorUserId(users: ApiUser[]): string | null {
  return users.find((u) => u.role === "OWNER")?.id ?? users[0]?.id ?? null;
}

export function readActorUserIdFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const raw = Array.isArray(searchParams.actorUserId)
    ? searchParams.actorUserId[0]
    : searchParams.actorUserId;
  return raw?.trim() ?? "";
}

export function withActorQuery(
  path: string,
  actorUserId: string,
  extra?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  params.set("actorUserId", actorUserId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== "") params.set(k, v);
    }
  }
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}
