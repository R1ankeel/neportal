import {
  affectedTasksTruncatedFooter,
  formatDate,
  groupAffectedTasksByProject,
  taskStatusLabel,
} from "@/lib/format-absence";
import type { ApiAbsence, ApiAbsenceAffectedTask } from "@/lib/types";

export function AbsenceAffectedTasksList({
  absence,
  tasks,
  singleProjectName,
}: {
  absence: Pick<ApiAbsence, "affectedTasksTruncated">;
  tasks: ApiAbsenceAffectedTask[];
  /** When set, render one section without per-project headers (project page). */
  singleProjectName?: string;
}) {
  if (tasks.length === 0) {
    return (
      <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
        Нет задач с дедлайном на период отсутствия.
      </p>
    );
  }

  const footer = affectedTasksTruncatedFooter(absence);
  const sections = singleProjectName
    ? [{ projectName: singleProjectName, tasks }]
    : groupAffectedTasksByProject(tasks);

  return (
    <div className="mt-2 space-y-4">
      {sections.map((section) => (
        <div key={section.projectName}>
          {!singleProjectName ? (
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Проект: {section.projectName}
            </p>
          ) : null}
          <ul className={`space-y-2 ${singleProjectName ? "" : "mt-2"}`}>
            {section.tasks.map((t, index) => (
              <li
                key={t.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50"
              >
                <span className="font-medium">
                  {index + 1}. {t.title}
                </span>
                <span className="text-sm text-zinc-500">
                  {formatDate(t.deadlineAt)} · {taskStatusLabel(t.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {footer ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{footer}</p>
      ) : null}
    </div>
  );
}
