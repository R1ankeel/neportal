import type { AddTaskCommentPayload } from "./add-task-comment-payload";
import {
  buildAddTaskCommentPayload,
  getAddTaskCommentComment,
  getAddTaskCommentTaskQuery,
} from "./add-task-comment-payload";
import { extractMentionUserHintFromCommentPhrase } from "./extract-mention-user-hint-from-comment";
import { splitCommentByExplicitSeparator } from "./ai/deterministic/split-comment-by-explicit-separator";
import {
  stemRussianWord,
  taskTokensMatch,
  tokenizeForTaskMatch,
} from "./task-search-text";

export type ValidateAddTaskCommentResult = {
  payload: AddTaskCommentPayload;
  needsTaskQuery?: boolean;
  needsComment?: boolean;
};

export function collapseSpaces(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function normalizeComparable(text: string): string {
  return collapseSpaces(text).toLowerCase().replace(/ё/g, "е");
}

function textsAlmostEqual(a: string, b: string): boolean {
  const na = normalizeComparable(a);
  const nb = normalizeComparable(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.85) {
    return true;
  }
  return false;
}

const SKIP_WORDS_BEFORE_HINT = new Set([
  "комментарий",
  "коммент",
  "напиши",
  "добавь",
  "оставь",
  "задаче",
  "задачу",
  "задача",
  "в",
  "к",
  "по",
  "на",
]);

function canonicalWord(raw: string): string {
  const w = raw.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]/gu, "");
  if (!w) return "";
  return stemRussianWord(w);
}

function isSkippableBeforeHintToken(token: string): boolean {
  return SKIP_WORDS_BEFORE_HINT.has(token);
}

type UserWordSpan = {
  raw: string;
  start: number;
  end: number;
  token: string;
};

function collectUserWordSpans(userText: string): UserWordSpan[] {
  const spans: UserWordSpan[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(userText)) !== null) {
    const raw = match[0];
    const token = canonicalWord(raw);
    if (!token) continue;
    spans.push({ raw, start: match.index, end: match.index + raw.length, token });
  }
  return spans;
}

/** Ищет конец вхождения taskQuery/taskTitle в userText (fuzzy по токенам). */
function findTaskHintEndCharIndex(userText: string, taskHint: string): number | null {
  const hintTokens = tokenizeForTaskMatch(taskHint);
  if (hintTokens.length === 0) return null;

  const words = collectUserWordSpans(userText);

  for (let i = 0; i < words.length; i++) {
    let hintIdx = 0;
    let lastEnd = -1;
    let j = i;

    while (j < words.length) {
      const word = words[j]!;

      if (hintIdx === 0 && isSkippableBeforeHintToken(word.token)) {
        j++;
        continue;
      }

      const hintToken = hintTokens[hintIdx];
      if (hintToken && taskTokensMatch(hintToken, word.token)) {
        lastEnd = word.end;
        hintIdx++;
        j++;
        continue;
      }

      if (hintIdx > 0 && hintIdx < hintTokens.length && isSkippableBeforeHintToken(word.token)) {
        j++;
        continue;
      }

      break;
    }

    if (hintIdx === hintTokens.length && lastEnd >= 0) {
      return lastEnd;
    }
  }

  return null;
}

const COMMENT_LEAD_PATTERNS = [
  /^(?:(?:напиши|добавь|оставь)\s+)?(?:комментарий|коммент)\s+/iu,
  /^(?:к|в|по)\s+задаче\s+/iu,
  /^к\s+задаче\s+/iu,
  /^в\s+задачу\s+(?:по\s+)?/iu,
  /^по\s+задаче\s+/iu,
  /^в\s+задачу\s+/iu,
  /^добавь\s+комментарий\s+/iu,
  /^напиши\s+комментарий\s+/iu,
  /^оставь\s+комментарий\s+/iu,
] as const;

export function stripCommentLead(text: string): string {
  let t = collapseSpaces(text);
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const re of COMMENT_LEAD_PATTERNS) {
      const next = t.replace(re, "").trim();
      if (next !== t) {
        t = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return t;
}

function recoverCommentAfterTaskHint(
  userText: string,
  taskHint: string | undefined,
): string | undefined {
  if (!taskHint?.trim()) return undefined;

  const endIndex = findTaskHintEndCharIndex(userText, taskHint);
  if (endIndex == null || endIndex >= userText.length) return undefined;

  const tail = stripCommentLead(userText.slice(endIndex));
  return tail.length > 0 ? tail : undefined;
}

function tryRecoverComment(
  userText: string,
  taskQuery: string | undefined,
  taskTitle: string | undefined,
): string | undefined {
  const trimmedUser = userText.trim();
  if (!trimmedUser) return undefined;

  const split = splitCommentByExplicitSeparator(trimmedUser);
  if (split?.comment) {
    return collapseSpaces(split.comment);
  }

  const fromQuery = recoverCommentAfterTaskHint(trimmedUser, taskQuery);
  if (fromQuery) return fromQuery;

  if (taskTitle && taskTitle !== taskQuery) {
    const fromTitle = recoverCommentAfterTaskHint(trimmedUser, taskTitle);
    if (fromTitle) return fromTitle;
  }

  return undefined;
}

function hasTaskReference(payload: AddTaskCommentPayload): boolean {
  return Boolean(
    payload.taskId?.trim() ||
      payload.taskQuery?.trim() ||
      payload.taskTitle?.trim(),
  );
}

/**
 * Bot-level validation/recovery для add_task_comment после LLM (и для pre-Zod fix).
 * Не сохраняет весь userText как comment.
 */
export function validateAddTaskCommentPayload(params: {
  payload: AddTaskCommentPayload;
  userText: string;
}): ValidateAddTaskCommentResult {
  const userText = params.userText.trim();
  let payload = buildAddTaskCommentPayload({
    taskQuery: params.payload.taskQuery,
    taskTitle: params.payload.taskTitle,
    comment: params.payload.comment ?? params.payload.text,
    text: params.payload.text,
    mentionedUserId: params.payload.mentionedUserId,
    mentionUserHints: params.payload.mentionUserHints,
  });

  if (payload.taskId?.trim()) {
    payload = { ...payload, taskId: payload.taskId.trim() };
  }

  let taskQuery = getAddTaskCommentTaskQuery(payload);
  let comment = getAddTaskCommentComment(payload);

  if (userText) {
    const split = splitCommentByExplicitSeparator(userText);
    if (split) {
      if (split.comment) {
        comment = collapseSpaces(split.comment);
      }
      if (split.taskQuery && !taskQuery) {
        taskQuery = collapseSpaces(split.taskQuery);
        payload = buildAddTaskCommentPayload({
          ...payload,
          taskQuery,
          taskTitle: payload.taskTitle ?? taskQuery,
          comment,
        });
      }
    }
  }

  const commentLooksLikeFullUserMessage =
    comment != null &&
    comment.length > 0 &&
    userText.length > 0 &&
    textsAlmostEqual(comment, userText) &&
    Boolean(taskQuery || payload.taskTitle?.trim());

  const commentIsBad = !comment || commentLooksLikeFullUserMessage;

  if (commentIsBad && userText) {
    const recovered = tryRecoverComment(userText, taskQuery, payload.taskTitle);
    if (recovered && !textsAlmostEqual(recovered, userText)) {
      comment = recovered;
    } else {
      comment = undefined;
    }
  } else if (comment) {
    comment = collapseSpaces(comment);
    if (commentLooksLikeFullUserMessage) {
      const recovered = tryRecoverComment(userText, taskQuery, payload.taskTitle);
      if (recovered && !textsAlmostEqual(recovered, userText)) {
        comment = recovered;
      } else {
        comment = undefined;
      }
    }
  }

  let mentionUserHints =
    params.payload.mentionUserHints?.map((h) => h.trim()).filter(Boolean) ?? [];
  if (mentionUserHints.length === 0 && userText) {
    const extracted = extractMentionUserHintFromCommentPhrase(userText);
    if (extracted) mentionUserHints = [extracted];
  }

  payload = buildAddTaskCommentPayload({
    taskQuery,
    taskTitle: payload.taskTitle ?? taskQuery,
    comment,
    mentionedUserId: params.payload.mentionedUserId,
    mentionUserHints: mentionUserHints.length > 0 ? mentionUserHints : undefined,
  });
  if (params.payload.taskId?.trim()) {
    payload = { ...payload, taskId: params.payload.taskId.trim() };
  }

  const needsTaskQuery = !hasTaskReference(payload);
  const needsComment = !getAddTaskCommentComment(payload);

  return {
    payload,
    ...(needsTaskQuery ? { needsTaskQuery: true } : {}),
    ...(needsComment ? { needsComment: true } : {}),
  };
}
