import type { PromptGroup } from "./prompt-group-router";
import { CORE_JSON_RULES, USER_HINT_RULES } from "./prompts/shared-rules";
import { ABSENCE_PROMPT } from "./prompts/absence-prompt";
import { CLASSIFIER_PROMPT } from "./prompts/classifier-prompt";
import { CREATE_NOTE_PROMPT } from "./prompts/create-note-prompt";
import { CREATE_TASK_RICH_PROMPT } from "./prompts/create-task-rich-prompt";
import { EXPENSE_PROMPT } from "./prompts/expense-prompt";
import { TASK_COLLABORATION_PROMPT } from "./prompts/task-collaboration-prompt";
import { TASK_LIST_PROMPT } from "./prompts/task-list-prompt";
import { TASK_STATUS_PROMPT } from "./prompts/task-status-prompt";

const GROUP_PROMPTS: Record<Exclude<PromptGroup, "classifier">, string> = {
  "create-task-rich": CREATE_TASK_RICH_PROMPT,
  "create-note": CREATE_NOTE_PROMPT,
  expense: EXPENSE_PROMPT,
  absence: ABSENCE_PROMPT,
  "task-status": TASK_STATUS_PROMPT,
  collaboration: TASK_COLLABORATION_PROMPT,
  "task-list": TASK_LIST_PROMPT,
};

const GROUP_SUFFIX: Partial<Record<PromptGroup, string>> = {
  classifier: "",
  absence: USER_HINT_RULES,
  "task-list": USER_HINT_RULES,
  "create-task-rich": USER_HINT_RULES,
  collaboration: USER_HINT_RULES,
  "create-note": USER_HINT_RULES,
};

export function buildSystemPrompt(group: PromptGroup): string {
  const groupPrompt =
    group === "classifier" ? CLASSIFIER_PROMPT : GROUP_PROMPTS[group];
  const suffix = GROUP_SUFFIX[group];
  const parts = [CORE_JSON_RULES, groupPrompt];
  if (suffix) parts.push(suffix);
  return parts.join("\n\n");
}

/** Длины промптов для dev-метрик (символы ≈ токены). */
export function measureSystemPrompt(group: PromptGroup | string): {
  systemChars: number;
  groupChars: number;
} {
  if (group === "classifier" || group in GROUP_PROMPTS) {
    const g = group as PromptGroup;
    const full = buildSystemPrompt(g);
    const groupOnly =
      g === "classifier" ? CLASSIFIER_PROMPT : GROUP_PROMPTS[g as Exclude<PromptGroup, "classifier">];
    return { systemChars: full.length, groupChars: groupOnly.length };
  }
  return { systemChars: CORE_JSON_RULES.length, groupChars: 0 };
}
