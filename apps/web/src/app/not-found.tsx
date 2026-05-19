import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-100 p-6 dark:bg-zinc-950">
      <h1 className="text-3xl font-semibold">Страница не найдена</h1>
      <Link href="/dashboard" className="text-lg text-zinc-700 underline dark:text-zinc-300">
        На главную
      </Link>
    </div>
  );
}
