import Link from "next/link";

const nav = [
  { href: "/dashboard", label: "Главная" },
  { href: "/projects", label: "Проекты" },
  { href: "/employees", label: "Сотрудники" },
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
        </nav>
        <p className="mt-6 hidden text-sm text-zinc-400 md:block">
          Задачи и бюджеты — внутри проекта.
        </p>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
