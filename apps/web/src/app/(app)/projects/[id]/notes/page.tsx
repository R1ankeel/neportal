import { apiGet } from "@/lib/api";
import type { ApiNote } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectNotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let notes: ApiNote[] = [];
  let error: string | null = null;
  try {
    notes = await apiGet<ApiNote[]>("/notes", { projectId: id });
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Заметки</h2>
      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">{error}</p>
      ) : null}

      {notes.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xl text-zinc-600 dark:text-zinc-400">Заметок пока нет</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500">{new Date(n.createdAt).toLocaleString("ru-RU")}</p>
              <p className="mt-2 text-lg">{n.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
