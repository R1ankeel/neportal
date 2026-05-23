import type { AiIntent } from "./ai-contracts";
import type { ApiUser } from "./api";
import { resolveUsersByHint } from "./resolve-users-by-hint";

const CREATE_TASK_BODY_RE =
  /^(?:создай|поставь|заведи|добавь)(?:те)?\s+(?:задачу|хадачу)\s+(.+)$/iu;

const INFINITIVE_SUFFIX = /(?:ть|ти|чь|чься|ться)$/iu;

function normalizeCreateTaskInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

/** Слово похоже на имя в дательном падеже, а не на глагол-инфинитив. */
export function looksLikeAssigneeHintWord(word: string): boolean {
  const w = word.trim().toLowerCase().replace(/ё/g, "е");
  if (w.length < 2 || !/^[\p{L}\-]+$/u.test(w)) return false;
  if (INFINITIVE_SUFFIX.test(w)) return false;
  if (/^(?:мне|меня|себе|нам|вам|им)$/u.test(w)) return false;
  return /[еуюиой]$/u.test(w) || /^[\p{L}]{2,15}$/u.test(w);
}

function extractPreservingCase(original: string, normalizedNeedle: string): string {
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

function capitalizeTaskTitle(value: string): string {
  const t = value.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function splitCreateTaskActionText(
  originalText: string,
  actionNorm: string,
): { title: string; description?: string } {
  const trimmed = actionNorm.trim();
  if (!trimmed) return { title: "" };

  const parts = trimmed.split(/\s+и\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const title = capitalizeTaskTitle(extractPreservingCase(originalText, parts[0]!));
    const descParts = parts.slice(1).map((p) =>
      capitalizeTaskTitle(extractPreservingCase(originalText, p)),
    );
    const description = descParts.map((p) => (p.endsWith(".") ? p : `${p}.`)).join(" ");
    return { title, description };
  }

  return { title: capitalizeTaskTitle(extractPreservingCase(originalText, trimmed)) };
}

export type LeadingAssigneeExtract = {
  assigneeHint: string;
  actionNorm: string;
};

/** «создай задачу маше поехать…» → assignee + остаток действия. */
export function extractLeadingAssigneeFromCreateTaskMessage(
  userText: string,
): LeadingAssigneeExtract | null {
  const normalized = normalizeCreateTaskInput(userText);
  const m = normalized.match(CREATE_TASK_BODY_RE);
  if (!m?.[1]) return null;

  const body = m[1].trim();
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  if (words.length >= 3 && looksLikeAssigneeHintWord(words[0]!) && looksLikeAssigneeHintWord(words[1]!)) {
    const assigneeNorm = `${words[0]} ${words[1]}`;
    const actionNorm = words.slice(2).join(" ");
    if (actionNorm.trim()) {
      return {
        assigneeHint: extractPreservingCase(userText, assigneeNorm),
        actionNorm,
      };
    }
  }

  const first = words[0]!;
  if (!looksLikeAssigneeHintWord(first)) return null;

  const actionNorm = words.slice(1).join(" ");
  if (!actionNorm.trim()) return null;

  return {
    assigneeHint: extractPreservingCase(userText, first),
    actionNorm,
  };
}

function tryAssigneeFromTitleStart(
  payload: Record<string, unknown>,
  users: ApiUser[],
  currentUser: ApiUser,
  userText: string,
): boolean {
  if (typeof payload.assigneeHint === "string" && payload.assigneeHint.trim()) {
    return false;
  }
  if (typeof payload.title !== "string") return false;

  const title = payload.title.trim();
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;

  const tryHints: string[] = [];
  if (words.length >= 2 && looksLikeAssigneeHintWord(words[0]!) && looksLikeAssigneeHintWord(words[1]!)) {
    tryHints.push(`${words[0]} ${words[1]}`);
  }
  if (looksLikeAssigneeHintWord(words[0]!)) {
    tryHints.push(words[0]!);
  }

  for (const hintNorm of tryHints) {
    const hint = extractPreservingCase(userText, hintNorm) || hintNorm;
    const match = resolveUsersByHint(users, hint, currentUser);
    if (match.kind !== "one") continue;

    const titleNorm = title.toLowerCase().replace(/ё/g, "е");
    if (!titleNorm.startsWith(hintNorm)) continue;

    const remainderNorm = titleNorm.slice(hintNorm.length).trim();
    if (!remainderNorm) continue;

    const split = splitCreateTaskActionText(userText, remainderNorm);
    payload.assigneeHint = hint;
    payload.title = split.title;
    if (split.description) payload.description = split.description;
    return true;
  }

  return false;
}

/**
 * Уточняет create_task: исполнитель из дательного падежа после «создай задачу».
 */
export function refineCreateTaskIntent(
  intent: Extract<AiIntent, { intent: "create_task" }>,
  users: ApiUser[],
  currentUser: ApiUser,
  userText: string,
): Extract<AiIntent, { intent: "create_task" }> {
  const payload = { ...intent.payload };
  let changed = false;

  if (!payload.assigneeHint?.trim()) {
    const leading = extractLeadingAssigneeFromCreateTaskMessage(userText);
    if (leading) {
      const match = resolveUsersByHint(users, leading.assigneeHint, currentUser);
      if (match.kind === "one") {
        const split = splitCreateTaskActionText(userText, leading.actionNorm);
        payload.assigneeHint = leading.assigneeHint;
        payload.title = split.title;
        if (split.description) payload.description = split.description;
        changed = true;
      } else if (match.kind === "many") {
        payload.assigneeHint = leading.assigneeHint;
        const split = splitCreateTaskActionText(userText, leading.actionNorm);
        payload.title = split.title;
        if (split.description) payload.description = split.description;
        changed = true;
      }
    }
  }

  if (!payload.assigneeHint?.trim()) {
    if (tryAssigneeFromTitleStart(payload, users, currentUser, userText)) {
      changed = true;
    }
  } else if (payload.assigneeHint.trim()) {
    const match = resolveUsersByHint(users, payload.assigneeHint, currentUser);
    if (match.kind === "one") {
      const hintNorm = payload.assigneeHint.trim().toLowerCase().replace(/ё/g, "е");
      const titleNorm = payload.title.trim().toLowerCase().replace(/ё/g, "е");
      if (titleNorm.startsWith(hintNorm)) {
        const remainder = payload.title.slice(payload.assigneeHint.length).trim();
        if (remainder) {
          const split = splitCreateTaskActionText(
            userText,
            remainder.toLowerCase().replace(/ё/g, "е"),
          );
          payload.title = split.title;
          if (split.description) payload.description = split.description;
          changed = true;
        }
      }
    }
  }

  if (!changed) return intent;
  return { ...intent, payload };
}

/** Для parse-create-task-query: assignee только если слово похоже на имя. */
export function shouldTreatFirstWordAsAssignee(word: string): boolean {
  return looksLikeAssigneeHintWord(word);
}
