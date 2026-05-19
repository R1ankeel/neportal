import Link from "next/link";

const nav = [
  { href: "/dashboard", label: "Главная" },
  { href: "/projects", label: "Проекты" },
  { href: "/tasks", label: "Задачи" },
  { href: "/budgets", label: "Бюджеты" },
] as const;

const comingSoon = [
  { href: "#", label: "Сотрудники", disabled: true },
  { href: "#", label: "Отсутствия", disabled: true },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 text-zinc-900 md:flex-row dark:bg-zinc-950 dark:text-zinc-50">
      <aside className="border-b border-zinc-200 bg-white px-4 py-4 md:w-56 md:shrink-0 md:border-b-0 md:border-r dark:border-zinc-800 dark:bg-zinc-900">
        <Link href="/dashboard" className="mb-6 block text-xl font-semibold tracking-tight">
          Neportal
        </Link>
        <nav className="flex flex-wrap gap-2 md:flex-col md:gap-1" aria-label="Основное меню">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2.5 text-base font-medium text-zinc-700 hover:bg-zinc-100 md:text-lg dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-4 hidden w-full border-t border-zinc-200 pt-3 text-sm text-zinc-400 md:block dark:border-zinc-800">
            Скоро
          </div>
          {comingSoon.map((item) => (
            <span
              key={item.label}
              className="rounded-lg px-3 py-2 text-base text-zinc-400 md:text-base"
              title="В разработке"
            >
              {item.label}
            </span>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
