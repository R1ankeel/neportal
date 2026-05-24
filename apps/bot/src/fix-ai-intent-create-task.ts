import { looksLikeAssigneeHintWord, splitCreateTaskActionText } from "./create-task-assignee-extract";
import { normalizeCreateTaskTitleDescription } from "./normalize-create-task-title-description";

const FOR_USER_TITLE_RE = /^для\s+(\p{L}+)\s+(.+)$/iu;
const ON_USER_TITLE_RE = /^на\s+(\p{L}+)\s+(.+)$/iu;

function capitalizeFirst(value: string): string {
  const t = value.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function namesRoughlyMatch(assigneeHint: string, userFromTitle: string): boolean {
  const a = assigneeHint.trim().toLowerCase().replace(/ё/g, "е");
  const u = userFromTitle.trim().toLowerCase().replace(/ё/g, "е");
  if (!a || !u) return false;
  if (a === u) return true;
  const aFirst = a.split(/\s+/)[0]!;
  const uFirst = u.split(/\s+/)[0]!;
  return a.startsWith(uFirst) || u.startsWith(aFirst) || aFirst === uFirst;
}

/**
 * Fallback для create_task: text→title, снятие «для/на {user}» с title.
 */
export function applyCreateTaskPayloadCompatibilityFix(
  payload: Record<string, unknown>,
): boolean {
  let changed = false;

  if (
    (payload.title === undefined || payload.title === null || payload.title === "") &&
    typeof payload.text === "string" &&
    payload.text.trim()
  ) {
    payload.title = payload.text.trim();
    delete payload.text;
    changed = true;
  }

  if (typeof payload.title !== "string") return changed;

  let title = payload.title.trim();
  if (!title) return changed;

  const forMatch = title.match(FOR_USER_TITLE_RE);
  const onMatch = title.match(ON_USER_TITLE_RE);
  const userFromTitle = forMatch?.[1] ?? onMatch?.[1];
  const restTitle = forMatch?.[2] ?? onMatch?.[2];

  if (userFromTitle && restTitle?.trim()) {
    const assignee =
      typeof payload.assigneeHint === "string" ? payload.assigneeHint.trim() : "";

    if (!assignee || namesRoughlyMatch(assignee, userFromTitle)) {
      if (!assignee) {
        payload.assigneeHint = capitalizeFirst(userFromTitle);
        changed = true;
      }
      const cleaned = capitalizeFirst(restTitle.trim());
      if (cleaned && cleaned !== title) {
        payload.title = cleaned;
        changed = true;
      }
    }
  }

  if (!payload.assigneeHint && typeof payload.title === "string") {
    const words = payload.title.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 3 && looksLikeAssigneeHintWord(words[0]!) && looksLikeAssigneeHintWord(words[1]!)) {
      const hint = `${words[0]} ${words[1]}`;
      const remainder = words.slice(2).join(" ");
      const split = splitCreateTaskActionText(payload.title, remainder.toLowerCase().replace(/ё/g, "е"));
      payload.assigneeHint = capitalizeFirst(hint);
      payload.title = split.title;
      if (split.description) payload.description = split.description;
      changed = true;
    } else if (words.length >= 2 && looksLikeAssigneeHintWord(words[0]!)) {
      const hint = words[0]!;
      const remainder = words.slice(1).join(" ");
      const split = splitCreateTaskActionText(payload.title, remainder.toLowerCase().replace(/ё/g, "е"));
      payload.assigneeHint = capitalizeFirst(hint);
      payload.title = split.title;
      if (split.description) payload.description = split.description;
      changed = true;
    }
  }

  return changed;
}

/** Восстанавливает description из длинного title, если модель не разделила. */
export function applyCreateTaskTitleDescriptionFix(payload: Record<string, unknown>): void {
  const normalized = normalizeCreateTaskTitleDescription({
    title: typeof payload.title === "string" ? payload.title : null,
    description: typeof payload.description === "string" ? payload.description : null,
  });

  if (normalized.title) payload.title = normalized.title;
  if (normalized.description) payload.description = normalized.description;
}
