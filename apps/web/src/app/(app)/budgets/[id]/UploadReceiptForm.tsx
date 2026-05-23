"use client";

import { useActionState } from "react";
import { uploadExpenseReceipt, type UploadReceiptState } from "./actions";

export function UploadReceiptForm({
  expenseId,
  budgetId,
  uploadedById,
}: {
  expenseId: string;
  budgetId: string;
  uploadedById: string;
}) {
  const [state, formAction, pending] = useActionState<UploadReceiptState | undefined, FormData>(
    uploadExpenseReceipt,
    undefined,
  );

  return (
    <form action={formAction} className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="uploadedById" value={uploadedById} />

      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Ожидает чек</p>

      {state?.ok === false && state.message ? (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">
          {state.message}
        </p>
      ) : null}
      {state?.ok === true ? (
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">Чек загружен, расход подтверждён</p>
      ) : null}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Файл чека (JPEG, PNG, WebP, PDF)</span>
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
