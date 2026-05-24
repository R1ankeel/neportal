export type SplitCommentBySeparatorResult = {
  taskQuery: string;
  comment: string;
};

/** Убирает служебные префиксы из части до разделителя, оставляя подсказку для поиска задачи. */
function stripTaskQueryLead(text: string): string {
  let t = text.trim();
  t = t.replace(
    /^(?:напиши|добавь|оставь)?\s*(?:комментарий|коммент)\s*/iu,
    "",
  );
  t = t.replace(/^(?:к|в|по)\s+(?:задаче\s+)?/iu, "");
  t = t.replace(/^задаче\s+/iu, "");
  t = t.replace(/^задачу\s+(?:по\s+)?/iu, "");
  t = t.replace(/^в\s+задачу\s+по\s+/iu, "");
  return t.trim() || text.trim();
}

const EXPLICIT_SEPARATORS: Array<{ re: RegExp; pick: (m: RegExpMatchArray, raw: string) => SplitCommentBySeparatorResult | null }> = [
  {
    re: /:\s*/u,
    pick: (m, raw) => {
      const idx = m.index ?? -1;
      if (idx <= 0 || idx >= raw.length - 1) return null;
      const before = raw.slice(0, idx).trim();
      const after = raw.slice(idx + m[0].length).trim();
      if (!after) return null;
      const taskQuery = stripTaskQueryLead(before);
      return taskQuery ? { taskQuery, comment: after } : null;
    },
  },
  {
    re: /,\s*что\s+/iu,
    pick: (m, raw) => {
      const idx = m.index ?? -1;
      if (idx < 0) return null;
      const before = raw.slice(0, idx).trim();
      const after = raw.slice(idx + m[0].length).trim();
      if (!after) return null;
      const taskQuery = stripTaskQueryLead(before);
      return taskQuery ? { taskQuery, comment: after } : null;
    },
  },
  {
    re: /\s+с\s+текстом\s+/iu,
    pick: (m, raw) => {
      const idx = m.index ?? -1;
      if (idx < 0) return null;
      const before = raw.slice(0, idx).trim();
      const after = raw.slice(idx + m[0].length).trim();
      if (!after) return null;
      const taskQuery = stripTaskQueryLead(before);
      return taskQuery ? { taskQuery, comment: after } : null;
    },
  },
  {
    re: /\s+что\s+/iu,
    pick: (m, raw) => {
      const idx = m.index ?? -1;
      if (idx < 0) return null;
      const before = raw.slice(0, idx).trim();
      const after = raw.slice(idx + m[0].length).trim();
      if (!after) return null;
      const taskQuery = stripTaskQueryLead(before);
      return taskQuery ? { taskQuery, comment: after } : null;
    },
  },
];

/**
 * Минимальный fallback: явные разделители (двоеточие, «, что», « что », « с текстом »).
 * Не покрывает свободные формулировки — для них отвечает LLM.
 */
export function splitCommentByExplicitSeparator(
  rawText: string,
): SplitCommentBySeparatorResult | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  for (const { re, pick } of EXPLICIT_SEPARATORS) {
    const m = trimmed.match(re);
    if (!m || m.index === undefined) continue;
    const result = pick(m, trimmed);
    if (result) return result;
  }

  return null;
}
