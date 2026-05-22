import Link from "next/link";
import type { ApiTask } from "@/lib/types";

function outcomeSubtext(task: ApiTask): { label: string; text: string } | null {
  if (task.status === "DONE") {
    const text = task.completionResult?.trim();
    if (text) return { label: "Результат:", text };
  }
  if (task.status === "CANCELLED") {
    const text = task.cancellationReason?.trim();
    if (text) return { label: "Причина отмены:", text };
  }
  return null;
}

/** Название задачи и при необходимости результат/причина отмены. */
export function TaskTitleCell({ task }: { task: ApiTask }) {
  const outcome = outcomeSubtext(task);

  return (
    <div>
      <Link href={`/tasks/${task.id}`} className="font-medium hover:underline">
        {task.title}
      </Link>
      {outcome ? (
        <p className="mt-1 text-sm leading-snug text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-400 dark:text-zinc-500">{outcome.label}</span> {outcome.text}
        </p>
      ) : null}
    </div>
  );
}
