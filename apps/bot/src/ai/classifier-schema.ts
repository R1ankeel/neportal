import type { AiIntentName } from "@neportal/ai-contracts";

export type ClassifierResult = {
  intent: AiIntentName;
  confidence: number;
};

const VALID_INTENTS = new Set<string>([
  "create_task",
  "create_note",
  "create_expense",
  "create_budget",
  "create_absence",
  "cancel_absence",
  "set_task_deadline",
  "complete_task",
  "cancel_task",
  "start_task",
  "add_task_comment",
  "mention_in_task",
  "transfer_task",
  "reassign_task",
  "list_my_tasks",
  "list_user_tasks",
  "list_pending_expenses",
  "unknown",
]);

function parseConfidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value));
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  }
  return 0.5;
}

/** Валидирует ответ classifier: только intent + confidence, payload игнорируется. */
export function parseClassifierResult(parsed: unknown): ClassifierResult | null {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  const intent = obj.intent;
  if (typeof intent !== "string" || !VALID_INTENTS.has(intent)) {
    return null;
  }

  return {
    intent: intent as AiIntentName,
    confidence: parseConfidence(obj.confidence),
  };
}
