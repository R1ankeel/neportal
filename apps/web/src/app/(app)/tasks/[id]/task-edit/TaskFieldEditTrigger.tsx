export function TaskFieldEditTrigger({
  label = "Изменить",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
    >
      {label}
    </button>
  );
}
