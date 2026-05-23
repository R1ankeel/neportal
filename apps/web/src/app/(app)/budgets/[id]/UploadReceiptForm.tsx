"use client";

import { getPublicApiBaseUrl } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function UploadReceiptForm({
  expenseId,
  uploadedById,
}: {
  expenseId: string;
  uploadedById: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);

    const form = e.currentTarget;
    const file = new FormData(form).get("file");

    if (!(file instanceof File) || file.size === 0) {
      setError("Выберите файл");
      setPending(false);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Файл слишком большой (максимум 10 МБ)");
      setPending(false);
      return;
    }

    const body = new FormData();
    body.append("file", file);
    body.append("uploadedById", uploadedById);

    try {
      const res = await fetch(`${getPublicApiBaseUrl()}/budget-expenses/${expenseId}/receipt`, {
        method: "POST",
        body,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setError(parseApiError(text, res.status));
        return;
      }

      await res.json().catch(() => null);

      setSuccess(true);
      form.reset();
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg && msg !== "Failed to fetch"
          ? msg
          : "Не удалось получить ответ от сервера. Если чек уже прикрепился — обновите страницу.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20"
    >
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Ожидает чек</p>

      {error ? (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">Чек загружен, расход подтверждён</p>
      ) : null}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
            Файл чека (JPEG, PNG, WebP, PDF, до 10 МБ)
          </span>
          <input
            type="file"
            name="file"
            required
            accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
            className="w-full text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Загрузка…" : "Загрузить чек"}
        </button>
      </div>
    </form>
  );
}

function parseApiError(text: string, status: number): string {
  if (!text) return `Ошибка ${status}`;
  try {
    const json = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(json.message)) return json.message.join(", ");
    if (typeof json.message === "string") return json.message;
  } catch {
    /* plain text */
  }
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
