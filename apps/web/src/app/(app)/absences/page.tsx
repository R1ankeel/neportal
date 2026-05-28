import { redirect } from "next/navigation";
import { ActorUserSelector } from "@/components/notes/ActorUserSelector";
import { AbsenceAffectedTasksList } from "@/components/absences/AbsenceAffectedTasksList";
import { apiGet } from "@/lib/api";
import {
  pickDefaultActorUserId,
  readActorUserIdFromSearchParams,
} from "@/lib/actor-user";
import { absenceStatusLabel, absenceTypeLabel, formatDate } from "@/lib/format";
import type { ApiAbsence, ApiUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AbsencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const users = await apiGet<ApiUser[]>("/users");
  const defaultActor = pickDefaultActorUserId(users);
  if (!defaultActor) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-semibold md:text-4xl">Отсутствия</h1>
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          Нет пользователей.
        </p>
      </div>
    );
  }

  const actorUserId = readActorUserIdFromSearchParams(sp);
  if (!actorUserId) {
    redirect(`/absences?actorUserId=${encodeURIComponent(defaultActor)}`);
  }

  let absences: ApiAbsence[] = [];
  let error: string | null = null;
  try {
    absences = await apiGet<ApiAbsence[]>("/absences", { actorUserId });
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold md:text-4xl">Отсутствия</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Больничные и отпуска на уровне организации (не привязаны к проекту).
        </p>
        <ActorUserSelector users={users} actorUserId={actorUserId} />
      </header>

      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
        Глобальный реестр отсутствий. Внутри проекта на вкладке «Отсутствия» показаны только
        сотрудники этого проекта (read-only проекция).
      </p>

      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          {error}
        </p>
      ) : null}

      {absences.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xl text-zinc-600 dark:text-zinc-400">Отсутствий пока нет</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {absences.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold">{a.user.fullName}</h2>
                <span className="text-base text-zinc-600 dark:text-zinc-400">
                  {absenceTypeLabel(a.type)}
                </span>
              </div>

              <dl className="mt-3 grid gap-2 text-base sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-zinc-500 dark:text-zinc-400">Статус</dt>
                  <dd>{absenceStatusLabel(a.status)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-zinc-500 dark:text-zinc-400">Период</dt>
                  <dd>
                    {formatDate(a.startDate)} — {formatDate(a.endDate)}
                  </dd>
                </div>
                {a.type === "SICK_LEAVE" && a.documentNumber ? (
                  <div>
                    <dt className="text-sm text-zinc-500 dark:text-zinc-400">Номер больничного</dt>
                    <dd>{a.documentNumber}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Задачи на период отсутствия
                </h3>
                <AbsenceAffectedTasksList absence={a} tasks={a.affectedTasks} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
