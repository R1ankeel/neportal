export function TaskFieldEditActions({
  pending,
  saveDisabled,
  onCancel,
  saveLabel = "Сохранить",
  pendingLabel = "Сохранение…",
  cancelLabel = "Отмена",
}: {
  pending: boolean;
  saveDisabled?: boolean;
  onCancel: () => void;
  saveLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="submit"
        disabled={pending || saveDisabled}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? pendingLabel : saveLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {cancelLabel}
      </button>
    </div>
  );
}
