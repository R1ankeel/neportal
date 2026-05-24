const TITLE_FILLER_PREFIX = /^(?:тоже|еще|ещё)\s+/iu;

const NOISE_MARKERS = [
  "эээ",
  "ээ",
  "ммм",
  "мм",
  "ну",
  "короче",
  "типа",
  "как бы",
  "там",
  "вот",
  "это самое",
] as const;

const NOISE_WORD_SET = new Set(
  NOISE_MARKERS.map((m) => m.replace(/\s+/g, " ").trim().toLowerCase()),
);

const INFINITIVE_SUFFIX = /(?:ть|ти|чь|чься|ться)$/iu;

export function isBasicTaskNoiseWord(word: string): boolean {
  const w = word.trim().toLowerCase().replace(/ё/g, "е");
  return NOISE_WORD_SET.has(w);
}

/** Исполнитель для basic parser: дательный падеж / «мне», без шумовых слов. */
export function looksLikeBasicAssigneeWord(word: string): boolean {
  const w = word.trim().toLowerCase().replace(/ё/g, "е");
  if (w.length < 2 || !/^[\p{L}\-]+$/u.test(w)) return false;
  if (isBasicTaskNoiseWord(w)) return false;
  if (INFINITIVE_SUFFIX.test(w)) return false;
  if (/^(?:мне|меня|себе|нам|вам|им)$/u.test(w)) return true;
  return /[еуюиой]$/u.test(w);
}

export const BASIC_CREATE_TASK_MAX_LENGTH = 110;

export function normalizeBasicCreateTaskInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

export function extractPreservingCase(original: string, normalizedNeedle: string): string {
  const needle = normalizedNeedle.trim();
  if (!needle) return "";

  const origLower = original.toLowerCase().replace(/ё/g, "е");
  const needleLower = needle.replace(/ё/g, "е");
  const idx = origLower.indexOf(needleLower);
  if (idx >= 0) {
    return original
      .slice(idx, idx + needle.length)
      .replace(/[.!?]+$/g, "")
      .trim();
  }
  return needle;
}

export function stripTitleFillers(normalized: string): string {
  let t = normalized.trim();
  while (TITLE_FILLER_PREFIX.test(t)) {
    t = t.replace(TITLE_FILLER_PREFIX, "").trim();
  }
  return t;
}

export function normalizeBasicTaskTitle(rawTitle: string): string {
  const t = rawTitle.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function rawTitleHasNoiseMarkers(rawTitle: string): boolean {
  const norm = normalizeBasicCreateTaskInput(rawTitle);
  if (!norm) return false;
  return NOISE_MARKERS.some((marker) => {
    const re = new RegExp(`(?:^|[\\s,.!?;:—-])${marker.replace(/\s+/g, "\\s+")}(?:$|[\\s,.!?;:—-])`, "iu");
    return re.test(norm);
  });
}

export function isCleanupBasicTasksEnabled(): boolean {
  return process.env.BOT_AI_CLEANUP_BASIC_TASKS?.trim().toLowerCase() === "true";
}

export function shouldCleanupBasicTaskTitle(
  rawTitle: string,
  options?: { textSource?: "text" | "voice" },
): boolean {
  if (options?.textSource === "voice") return true;
  if (isCleanupBasicTasksEnabled()) return true;
  return rawTitleHasNoiseMarkers(rawTitle);
}

export function isTooComplexForBasicCreateTask(
  fullText: string,
  actionNorm: string,
): boolean {
  if (fullText.trim().length > BASIC_CREATE_TASK_MAX_LENGTH) return true;
  const action = stripTitleFillers(actionNorm);
  if (!action) return true;
  if (/\s+и\s+/iu.test(action)) return true;
  if (/\s+(?:потом|после\s+этого)(?:\s|$)/iu.test(fullText)) return true;
  if (/,/.test(action)) return true;
  return false;
}

export function hasBasicCreateTaskMarker(normalized: string): boolean {
  if (!normalized) return false;
  if (/^(?:создай|поставь|заведи|добавь)(?:те)?\s+(?:задачу|хадачу)(?:\s|$)/iu.test(normalized)) {
    return true;
  }
  return /^(?:поставь|создай|добавь)(?:те)?\s+мне(?:\s+(?:задачу|хадачу))?(?:\s|$)/iu.test(
    normalized,
  );
}
