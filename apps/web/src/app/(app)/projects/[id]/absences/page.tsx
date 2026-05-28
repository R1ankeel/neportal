import Link from "next/link";
import { ProjectPageShell } from "@/components/projects/ProjectPageShell";
import { AbsenceAffectedTasksList } from "@/components/absences/AbsenceAffectedTasksList";
import { apiGet } from "@/lib/api";
import { withActorQuery } from "@/lib/actor-user";
import { resolveProjectActor } from "@/lib/resolve-project-actor";
import {
  absenceStatusLabel,
  absenceTypeLabel,
  formatDate,
} from "@/lib/format";
import type { ApiAbsence } from "@/lib/types";
import { findWebAuthor } from "@/lib/webAuthor";
import { CancelAbsenceButton } from "./CancelAbsenceButton";

export const dynamic = "force-dynamic";

export default async function ProjectAbsencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { actorUserId, users } = await resolveProjectActor(sp, `/projects/${id}/absences`);

  if (!actorUserId) {
    return (
      <div className="mx-auto max-w-5xl p-6 text-lg text-amber-900 dark:text-amber-100">
        Нет пользователей.
      </div>
    );
  }

  let absences: ApiAbsence[] = [];
  let error: string | null = null;
  try {
    absences = await apiGet<ApiAbsence[]>("/absences", { actorUserId, projectId: id });
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  const webAuthor = findWebAuthor(users);

  return (
    <ProjectPageShell projectId={id} actorUserId={actorUserId} users={users}>
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Отсутствия</h2>

        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          Отсутствия оформляются глобально на сотрудника. Здесь — read-only проекция по участникам
          проекта.{" "}
          <Link
            href={withActorQuery("/absences", actorUserId)}
            className="font-medium underline hover:no-underline"
          >
            Все отсутствия организации
          </Link>
        </p>

        {error ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            {error}
          </p>
        ) : null}

        {absences.length === 0 && !error ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-xl text-zinc-600 dark:text-zinc-400">
              Больничных и отпусков участников проекта пока нет.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {absences.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xl font-semibold">{a.user.fullName}</h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-base text-zinc-600 dark:text-zinc-400">
                      {absenceTypeLabel(a.type)}
                    </span>
                    {webAuthor ? (
                      <CancelAbsenceButton
                        projectId={id}
                        absenceId={a.id}
                        employeeFullName={a.user.fullName}
                        absenceKind={a.type === "SICK_LEAVE" ? "больничный" : "отпуск"}
                        cancelledById={webAuthor.id}
                      />
                    ) : null}
                  </div>
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
                  {a.comment ? (
                    <div className="sm:col-span-2">
                      <dt className="text-sm text-zinc-500 dark:text-zinc-400">Комментарий</dt>
                      <dd>{a.comment}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    Задачи на период отсутствия (в этом проекте)
                  </h4>
                  <AbsenceAffectedTasksList absence={a} tasks={a.affectedTasks} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ProjectPageShell>
  );
}
