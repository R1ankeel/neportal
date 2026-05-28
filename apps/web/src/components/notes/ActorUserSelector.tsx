"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ApiUser } from "@/lib/types";

export function ActorUserSelector({
  users,
  actorUserId,
}: {
  users: ApiUser[];
  actorUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setActor(nextActorUserId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("actorUserId", nextActorUserId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
        Пользователь
      </span>
      <select
        value={actorUserId}
        onChange={(e) => setActor(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-950"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.fullName} ({u.role})
          </option>
        ))}
      </select>
    </label>
  );
}

