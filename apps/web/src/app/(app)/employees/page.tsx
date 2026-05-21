import { apiGet } from "@/lib/api";
import type { ApiUser } from "@/lib/types";
import { AddEmployeeForm } from "./AddEmployeeForm";
import { EditUsernameForm } from "./EditUsernameForm";
import { getTelegramBindingStatus } from "./telegram-status";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  let users: ApiUser[] = [];
  let error: string | null = null;
  try {
    users = await apiGet<ApiUser[]>("/users");
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold md:text-4xl">Сотрудники</h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
          Участники организации и привязка Telegram
        </p>
      </header>

      {error ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          {error}
        </p>
      ) : null}

      <AddEmployeeForm />

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-base md:text-lg">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
              <th className="px-4 py-3 font-semibold">Имя</th>
              <th className="px-4 py-3 font-semibold">Роль</th>
              <th className="px-4 py-3 font-semibold">@username</th>
              <th className="px-4 py-3 font-semibold">Привязка</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const binding = getTelegramBindingStatus(u);
              return (
                <tr
                  key={u.id}
                  className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 font-medium">{u.fullName}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{u.role}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {u.telegramUsername ? `@${u.telegramUsername}` : "—"}
                    {!u.telegramId ? (
                      <EditUsernameForm userId={u.id} currentUsername={u.telegramUsername} />
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.telegramId
                          ? "text-emerald-700 dark:text-emerald-400"
                          : u.telegramUsername
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-zinc-500"
                      }
                    >
                      {binding.label}
                    </span>
                    {binding.detail ? (
                      <span className="mt-0.5 block text-xs text-zinc-400 dark:text-zinc-500">
                        {binding.detail}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
