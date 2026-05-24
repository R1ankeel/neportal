import type { AiIntentName } from "@neportal/ai-contracts";
import type { PromptGroup } from "./prompt-group-router";

export type ExtractorPromptGroup = Exclude<PromptGroup, "classifier">;

/** Intent из classifier → группа extractor-промпта. */
export function intentToExtractorGroup(intent: AiIntentName): ExtractorPromptGroup | null {
  switch (intent) {
    case "create_task":
      return "create-task-rich";
    case "create_note":
      return "create-note";
    case "create_expense":
    case "create_budget":
      return "expense";
    case "create_absence":
    case "cancel_absence":
      return "absence";
    case "set_task_deadline":
    case "complete_task":
    case "cancel_task":
    case "start_task":
      return "task-status";
    case "add_task_comment":
    case "mention_in_task":
    case "transfer_task":
    case "reassign_task":
      return "collaboration";
    case "list_my_tasks":
    case "list_user_tasks":
    case "list_pending_expenses":
      return "task-list";
    case "unknown":
      return null;
    default:
      return null;
  }
}
