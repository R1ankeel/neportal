/**
 * Deterministic parser for natural-language "comment with mention" phrases.
 *
 * Required examples (must match):
 *   "Комментарий для Леры в задаче по свиданию. Сегодня дождь, поплывём?"
 *   "Комментарий для Леры в задаче по свиданию: Сегодня дождь, поплывём?"
 *   "Напиши комментарий для Леры в задаче по свиданию. Сегодня дождь, поплывём?"
 *   "Добавь комментарий для Леры в задаче по свиданию. Сегодня дождь, поплывём?"
 *   "Оставь комментарий для Леры в задаче по свиданию. Сегодня дождь, поплывём?"
 *   "Комментарий Лере в задаче по свиданию. Сегодня дождь, поплывём?"
 *   "Лере комментарий в задаче по свиданию: Сегодня дождь, поплывём?"
 *   "В задаче по свиданию комментарий для Леры: Сегодня дождь, поплывём?"
 *   "Передай Лере в комментарии к задаче по свиданию, что сегодня дождь, поплывём?"
 *   "Отметь Леру в задаче по свиданию, сегодня дождь, поплывём?"
 *   "Позови Леру в задачу по свиданию, сегодня дождь, поплывём?"
 */

export type TaskCommentWithMentionResult = {
  taskHint: string;
  commentText: string;
  mentionUserHints: string[];
};

/** Strips leading "что" word from a captured comment text. */
function stripLeadingChto(text: string): string {
  return text.replace(/^что\s+/i, "").trim();
}

type PatternEntry = {
  /**
   * Regex with exactly 3 capture groups.
   * Compiled with "si" flags (case-insensitive, dotAll).
   * Matched against the ORIGINAL input text so ё is preserved in captures.
   */
  regex: RegExp;
  /** 1-based index of the USER hint group. */
  userIdx: 1 | 2;
  /** 1-based index of the TASK hint group. */
  taskIdx: 1 | 2;
};

// Separator between task hint and comment text: punctuation then optional "что "
const SEP = String.raw`[.,:]\s*(?:что\s+)?`;

const PATTERNS: PatternEntry[] = [
  // (verb) комментарий для USER (в|к) задаче (по) TASK sep TEXT
  {
    regex: new RegExp(
      String.raw`^(?:(?:напиши|добавь|оставь)(?:те)?\s+)?комментарий\s+для\s+(.+?)\s+(?:в|к)\s+задач[аеий]?\s+(?:по\s+)?(.+?)(?:` +
        SEP +
        String.raw`)(.+)$`,
      "si",
    ),
    userIdx: 1,
    taskIdx: 2,
  },

  // (verb) комментарий для USER в TASK (без слова «задаче»): «для Леры в разборе документов. …»
  {
    regex: new RegExp(
      String.raw`^(?:(?:напиши|добавь|оставь)(?:те)?\s+)?комментарий\s+для\s+(.+?)\s+в\s+(?!задач[аеийу])(.+?)(?:` +
        SEP +
        String.raw`)(.+)$`,
      "si",
    ),
    userIdx: 1,
    taskIdx: 2,
  },

  // (verb) комментарий для USER в задаче TASK (без «по»): «в задаче разбор документов. …»
  {
    regex: new RegExp(
      String.raw`^(?:(?:напиши|добавь|оставь)(?:те)?\s+)?комментарий\s+для\s+(.+?)\s+в\s+задач[аеий]?\s+(?!по\s)(.+?)(?:` +
        SEP +
        String.raw`)(.+)$`,
      "si",
    ),
    userIdx: 1,
    taskIdx: 2,
  },

  // (verb) комментарий USER_DAT (в|к) задаче (по) TASK sep TEXT
  // Negative lookahead guards against prepositions starting the user hint.
  {
    regex: new RegExp(
      String.raw`^(?:(?:напиши|добавь|оставь)(?:те)?\s+)?комментарий\s+(?!для\s|в\s|к\s|по\s|на\s|из\s|со?\s|за\s|от\s|об?\s|при\s)(.+?)\s+(?:в|к)\s+задач[аеий]?\s+(?:по\s+)?(.+?)(?:` +
        SEP +
        String.raw`)(.+)$`,
      "si",
    ),
    userIdx: 1,
    taskIdx: 2,
  },

  // (verb) комментарий USER_DAT в TASK (без «задаче»): «Лере в разборе документов. …»
  {
    regex: new RegExp(
      String.raw`^(?:(?:напиши|добавь|оставь)(?:те)?\s+)?комментарий\s+(?!для\s|в\s|к\s|по\s|на\s|из\s|со?\s|за\s|от\s|об?\s|при\s)(.+?)\s+в\s+(?!задач[аеийу])(.+?)(?:` +
        SEP +
        String.raw`)(.+)$`,
      "si",
    ),
    userIdx: 1,
    taskIdx: 2,
  },

  // USER_DAT комментарий (в|к) задаче (по) TASK sep TEXT
  // Negative lookahead excludes common verb openings so "Добавь комментарий …" won't match.
  {
    regex: new RegExp(
      String.raw`^(?!(?:напиши|добавь|оставь|напишите|добавьте|оставьте|позови|позовите|отметь|отметьте|передай|передайте|покажи|покажите|упомяни)\s)(.+?)\s+комментарий\s+(?:в|к)\s+задач[аеий]?\s+(?:по\s+)?(.+?)(?:` +
        SEP +
        String.raw`)(.+)$`,
      "si",
    ),
    userIdx: 1,
    taskIdx: 2,
  },

  // (в|к) задаче (по) TASK комментарий (для) USER sep TEXT
  {
    regex: new RegExp(
      String.raw`^(?:в|к)\s+задач[аеий]?\s+(?:по\s+)?(.+?)\s+комментарий\s+(?:для\s+)?(.+?)(?:` +
        SEP +
        String.raw`)(.+)$`,
      "si",
    ),
    userIdx: 2,
    taskIdx: 1,
  },

  // передай USER в комментарии (к|по) задаче (по) TASK sep TEXT
  {
    regex: new RegExp(
      String.raw`^передай(?:те)?\s+(.+?)\s+в\s+комментарии\s+(?:к|по)\s+задач[аеий]?\s+(?:по\s+)?(.+?)(?:` +
        SEP +
        String.raw`)(.+)$`,
      "si",
    ),
    userIdx: 1,
    taskIdx: 2,
  },

  // отметь USER (в|к) задаче (по) TASK sep TEXT
  {
    regex: new RegExp(
      String.raw`^отметь(?:те)?\s+(.+?)\s+(?:в|к)\s+задач[аеий]?\s+(?:по\s+)?(.+?)(?:` +
        SEP +
        String.raw`)(.+)$`,
      "si",
    ),
    userIdx: 1,
    taskIdx: 2,
  },

  // позови USER в задачу (по) TASK sep TEXT
  {
    regex: new RegExp(
      String.raw`^позови(?:те)?\s+(.+?)\s+в\s+задач[уюй]\s+(?:по\s+)?(.+?)(?:` +
        SEP +
        String.raw`)(.+)$`,
      "si",
    ),
    userIdx: 1,
    taskIdx: 2,
  },
];

export function parseTaskCommentWithMentionQuery(
  text: string,
): TaskCommentWithMentionResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const { regex, userIdx, taskIdx } of PATTERNS) {
    const m = regex.exec(trimmed);
    if (!m) continue;

    const userHint = (m[userIdx] ?? "").trim();
    const taskHint = (m[taskIdx] ?? "").trim();
    const rawComment = (m[3] ?? "").trim();

    // User hint must be at least 2 chars to exclude single-letter prepositions
    if (!userHint || userHint.length < 2 || !taskHint || !rawComment) continue;

    const commentText = stripLeadingChto(rawComment);
    if (!commentText) continue;

    return {
      taskHint,
      commentText,
      mentionUserHints: [userHint],
    };
  }

  return null;
}
