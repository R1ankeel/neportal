import type { PromptGroup } from "./prompt-group-router";
import { BASE_PROMPT } from "./prompts/base-prompt";
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

export function buildSystemPrompt(group: PromptGroup): string {
  const groupPrompt =
    group === "classifier" ? CLASSIFIER_PROMPT : GROUP_PROMPTS[group];
  return `${BASE_PROMPT}\n\n${groupPrompt}`;
}
