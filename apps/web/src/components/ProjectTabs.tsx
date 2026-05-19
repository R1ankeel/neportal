"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabDefs = [
  { suffix: "", label: "Обзор" },
  { suffix: "/tasks", label: "Задачи" },
  { suffix: "/notes", label: "Заметки" },
  { suffix: "/budgets", label: "Бюджеты" },
  { suffix: "/absences", label: "Отсутствия" },
] as const;

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800" role="tablist">
      {tabDefs.map((tab) => {
        const href = `${base}${tab.suffix}`;
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
