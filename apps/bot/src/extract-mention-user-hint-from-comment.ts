/** Извлекает hint упоминаемого из «комментарий для <имя> в …». */
export function extractMentionUserHintFromCommentPhrase(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const m =
    /^(?:(?:напиши|добавь|оставь)(?:те)?\s+)?комментарий\s+для\s+(\S+(?:\s+\S+)?)\s+в\s+/iu.exec(
      trimmed,
    );
  if (!m) return undefined;

  const hint = m[1]?.trim();
  if (!hint || hint.length < 2) return undefined;
  return hint;
}
