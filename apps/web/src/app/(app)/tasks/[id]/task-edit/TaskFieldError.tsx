export function TaskFieldError({ message }: { message: string }) {
  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}
