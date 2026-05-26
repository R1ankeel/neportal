/** User-facing message when an API call fails without a readable body. */
export function formatApiErrorMessage(
  status: number,
  bodyText?: string,
  fallback = "Не удалось сохранить изменения. Попробуйте ещё раз.",
): string {
  const trimmed = bodyText?.trim();
  if (trimmed) return trimmed;
  if (status > 0) return `Ошибка ${status}`;
  return fallback;
}

/** Fixed copy for inline field editors that hide server details. */
export function taskFieldErrorMessage(fieldLabel: string): string {
  return `Не удалось изменить ${fieldLabel}. Попробуйте ещё раз.`;
}
