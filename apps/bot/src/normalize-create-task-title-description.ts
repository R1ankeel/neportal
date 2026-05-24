/** Мягкий fallback: длинный title без description → первая часть в title, остальное в description. */

const LONG_TITLE_MIN_WORDS = 9;
const SHORT_TITLE_MAX_WORDS = 8;

const TITLE_PART_NOISE_PREFIX =
  /^(?:пусть|пусть\s+он|пусть\s+она|надо|нужно|создай(?:те)?\s+задачу|поставь(?:те)?\s+задачу|заведи(?:те)?\s+задачу|задача)\s+/iu;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function cleanTitlePart(part: string): string {
  let s = part.trim().replace(/\s+/g, " ");
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(TITLE_PART_NOISE_PREFIX, "").trim();
  }
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function splitIntoClauses(title: string): string[] {
  const normalized = title.replace(/;/g, ",").trim();
  const parts = normalized
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts;
}

function shouldTrySplit(title: string): boolean {
  const words = countWords(title);
  if (words <= SHORT_TITLE_MAX_WORDS) return false;

  const clauses = splitIntoClauses(title);
  if (clauses.length >= 2) return true;

  return words >= LONG_TITLE_MIN_WORDS;
}

function formatDescriptionPart(part: string): string {
  const cleaned = cleanTitlePart(part);
  if (!cleaned) return "";
  return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
}

export function normalizeCreateTaskTitleDescription(params: {
  userText?: string;
  title?: string | null;
  description?: string | null;
}): { title?: string; description?: string } {
  const title = params.title?.trim();
  const existingDesc = params.description?.trim();

  if (!title) {
    return {
      title: title ?? undefined,
      description: existingDesc || undefined,
    };
  }

  if (existingDesc) {
    return { title, description: existingDesc };
  }

  if (!shouldTrySplit(title)) {
    return { title };
  }

  const clauses = splitIntoClauses(title);
  if (clauses.length < 2) {
    return { title };
  }

  const first = cleanTitlePart(clauses[0]!);
  const rest = clauses
    .slice(1)
    .map(formatDescriptionPart)
    .filter((p) => p.length > 0);

  if (!first || rest.length === 0) {
    return { title };
  }

  if (countWords(first) > SHORT_TITLE_MAX_WORDS) {
    return { title };
  }

  return {
    title: first,
    description: rest.join(" "),
  };
}
