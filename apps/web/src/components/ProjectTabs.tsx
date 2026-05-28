"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const tabDefs = [
  { suffix: "", label: "Обзор" },
  { suffix: "/tasks", label: "Задачи" },
  { suffix: "/members", label: "Участники" },
  { suffix: "/notes", label: "Заметки" },
  { suffix: "/budgets", label: "Бюджеты" },
  { suffix: "/absences", label: "Отсутствия" },
] as const;

export function ProjectTabs({
  projectId,
  actorUserId,
}: {
  projectId: string;
  actorUserId: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const base = `/projects/${projectId}`;

  function tabHref(suffix: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("actorUserId", actorUserId);
    const q = params.toString();
    return q ? `${base}${suffix}?${q}` : `${base}${suffix}`;
  }

  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800" role="tablist">
      {tabDefs.map((tab) => {
        const href = tabHref(tab.suffix);
        const isOverview = tab.suffix === "";
        const active = isOverview
          ? pathname === base || pathname === `${base}/`
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.label}
            href={href}
            className={`rounded-lg px-4 py-2.5 text-base font-medium md:text-lg ${
              active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
