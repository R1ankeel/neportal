import { redirect } from "next/navigation";
import { apiGet } from "@/lib/api";
import type { ApiNote, ApiUser } from "@/lib/types";
import { ActorUserSelector } from "@/components/notes/ActorUserSelector";
import { NoteTextEditor } from "@/components/notes/NoteTextEditor";

export const dynamic = "force-dynamic";

function pickDefaultActorUserId(users: ApiUser[]): string | null {
  return users.find((u) => u.role === "OWNER")?.id ?? users[0]?.id ?? null;
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const actorUserIdRaw = Array.isArray(sp.actorUserId) ? sp.actorUserId[0] : sp.actorUserId;

  const users = await apiGet<ApiUser[]>("/users");
  const defaultActor = pickDefaultActorUserId(users);
  if (!defaultActor) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-semibold md:text-4xl">Заметки</h1>
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          Нет пользователей. Сначала создайте сотрудника.
        </p>
      </div>
    );
  }

  const actorUserId = actorUserIdRaw?.trim() || "";
  if (!actorUserId) {
    redirect(`/notes?actorUserId=${encodeURIComponent(defaultActor)}`);
  }

  let notes: ApiNote[] = [];
  let error: string | null = null;
  try {
    notes = await apiGet<ApiNote[]>("/notes", { actorUserId });
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold md:text-4xl">Заметки</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Заметки личные и не привязаны к проекту.
        </p>
        <ActorUserSelector users={users} actorUserId={actorUserId} />
      </header>

      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          {error}
        </p>
      ) : null}

      {notes.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xl text-zinc-600 dark:text-zinc-400">Заметок пока нет</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <NoteTextEditor note={n} actorUserId={actorUserId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

