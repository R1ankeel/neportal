export type TaskCommentsListQueryResult = {
  taskHint: string;
};

const TASK_COMMENTS_LIST_PATTERNS: RegExp[] = [
  /^покажи(?: мне)? комментарии по задаче (.+)$/,
  /^покажи(?: мне)? комментарии к задаче (.+)$/,
  /^комментарии(?: к| по)? задаче (.+)$/,
  /^все комментарии по задаче (.+)$/,
  /^все комментарии по (.+)$/,
  /^какие комментарии в задаче (.+)$/,
  /^что писали в задаче (.+)$/,
  /^что писали по задаче (.+)$/,
];

function normalizeForTaskCommentsListQuery(text: string): string {
  let s = text.trim().toLowerCase();
  s = s.replace(/ё/g, "е");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[?!.]+\s*$/g, "").trim();
  return s;
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[?!.,;:]+$/g, "").trim();
}

/** Сохраняет регистр/падеж из исходного текста. */
function extractHintPreservingCase(originalText: string, normalizedCapture: string): string {
  const needle = normalizedCapture.trim();
  if (!needle) return "";

  const origLower = originalText.toLowerCase().replace(/ё/g, "е");
  const needleLower = needle.replace(/ё/g, "е");
  const idx = origLower.indexOf(needleLower);
  if (idx >= 0) {
    return stripTrailingPunctuation(originalText.slice(idx, idx + needle.length));
  }
  return stripTrailingPunctuation(needle);
}

export function parseTaskCommentsListQuery(text: string): TaskCommentsListQueryResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const normalized = normalizeForTaskCommentsListQuery(trimmed);

  for (const regex of TASK_COMMENTS_LIST_PATTERNS) {
    const match = normalized.match(regex);
    if (!match?.[1]) continue;

    const captured = match[1].trim();
    if (!captured) continue;

    const taskHint = extractHintPreservingCase(trimmed, captured);
    if (!taskHint) continue;

    return { taskHint };
  }

  return null;
}
