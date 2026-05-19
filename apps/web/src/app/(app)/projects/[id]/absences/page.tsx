export const dynamic = "force-dynamic";

export default async function ProjectAbsencesPage() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-100">Отсутствия</h2>
      <p className="mx-auto mt-4 max-w-lg text-lg text-zinc-600 dark:text-zinc-400">
        Здесь будут больничные и отпуска участников проекта
      </p>
    </div>
  );
}
