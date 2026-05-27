import { z } from "zod";
import {
  optionalAiDeadlineDate,
  optionalAiString,
  optionalAiStringMin1,
} from "./optional-ai-string";

export {
  optionalAiString,
  optionalAiStringMin1,
  optionalAiDeadlineDate,
  preprocessOptionalAiString,
} from "./optional-ai-string";

export const AiIntentNameSchema = z.enum([
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
  "list_task_comments",
  "mention_in_task",
  "transfer_task",
  "reassign_task",
  "list_my_tasks",
  "list_user_tasks",
  "list_my_completed_tasks",
  "list_user_completed_tasks",
  "list_pending_expenses",
  "unknown",
]);

export type AiIntentName = z.infer<typeof AiIntentNameSchema>;

export const AbsenceTypeSchema = z.enum(["SICK_LEAVE", "VACATION"]);
export type AbsenceType = z.infer<typeof AbsenceTypeSchema>;

const intentBase = {
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.boolean(),
};

export const CreateTaskPayloadSchema = z.object({
  projectHint: optionalAiString,
  assigneeHint: optionalAiString,
  assigneeUserId: optionalAiString,
  title: z.string().min(1),
  description: optionalAiString,
  deadlineDate: optionalAiDeadlineDate,
});

export const CreateNotePayloadSchema = z.object({
  projectHint: optionalAiString,
  text: z.string().min(1),
});

export const CreateExpensePayloadSchema = z.object({
  projectHint: optionalAiString,
  budgetHint: optionalAiString,
  amount: z.number().positive(),
  description: optionalAiString,
});

export const CreateBudgetPayloadSchema = z.object({
  projectHint: optionalAiString,
  name: z.string().min(1),
  amount: z.number().positive(),
  requiresReceipt: z.boolean().optional(),
  matchingKeywords: optionalAiString,
});

export const CreateAbsencePayloadSchema = z.object({
  userHint: optionalAiString,
  userId: optionalAiString,
  type: AbsenceTypeSchema,
  startDate: optionalAiString,
  endDate: z.string(),
  documentNumber: optionalAiString,
  comment: optionalAiString,
});

export const CancelAbsencePayloadSchema = z.object({
  userHint: optionalAiString,
  userId: optionalAiString,
  type: AbsenceTypeSchema.optional(),
  cancellationReason: optionalAiString,
});

export const SetTaskDeadlinePayloadSchema = z.object({
  taskTitle: z.string().min(1),
  deadlineDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "deadlineDate must be YYYY-MM-DD"),
});

export const CompleteTaskPayloadSchema = z.object({
  taskTitle: z.string().min(1),
  completionResult: optionalAiStringMin1,
});

export const CancelTaskPayloadSchema = z.object({
  taskTitle: z.string().min(1),
  cancellationReason: optionalAiStringMin1,
});

export const StartTaskPayloadSchema = z.object({
  taskTitle: z.string().min(1),
});

export const AddTaskCommentPayloadSchema = z.object({
  taskQuery: optionalAiStringMin1,
  taskId: optionalAiString,
  taskTitle: optionalAiStringMin1,
  comment: optionalAiStringMin1,
  /** @deprecated use comment */
  text: optionalAiStringMin1,
  mentionedUserId: optionalAiString,
});

export const ListTaskCommentsPayloadSchema = z.object({
  taskQuery: optionalAiStringMin1,
  taskId: optionalAiString,
  taskTitle: optionalAiStringMin1,
});

export const MentionInTaskPayloadSchema = z.object({
  userHint: z.string().min(1),
  mentionedUserId: optionalAiString,
  taskTitle: z.string().min(1),
  text: optionalAiStringMin1,
});

export const TransferTaskPayloadSchema = z.object({
  taskTitle: z.string().min(1),
  toUserHint: z.string().min(1),
  toUserId: optionalAiString,
  comment: optionalAiStringMin1,
});

export const ReassignTaskPayloadSchema = z.object({
  taskTitle: z.string().min(1),
  fromUserHint: optionalAiStringMin1,
  fromUserId: optionalAiString,
  toUserHint: z.string().min(1),
  toUserId: optionalAiString,
  comment: optionalAiStringMin1,
});

export const ListMyTasksPayloadSchema = z.object({});

export const ListUserTasksPayloadSchema = z.object({
  userHint: z.string().min(1),
  userId: optionalAiString,
});

export const ListMyCompletedTasksPayloadSchema = z.object({});

export const ListUserCompletedTasksPayloadSchema = z.object({
  userHint: z.string().min(1),
  userId: optionalAiString,
});

export const ListPendingExpensesPayloadSchema = z.object({});

export const UnknownPayloadSchema = z.object({
  reason: optionalAiString,
});

/** Intent-based AI contract (no version / action / entity). */
const intentFields = {
  confidence: intentBase.confidence,
  requiresConfirmation: intentBase.requiresConfirmation,
};

export const AiIntentSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create_task"),
    ...intentFields,
    payload: CreateTaskPayloadSchema,
  }),
  z.object({
    intent: z.literal("create_note"),
    ...intentFields,
    payload: CreateNotePayloadSchema,
  }),
  z.object({
    intent: z.literal("create_expense"),
    ...intentFields,
    payload: CreateExpensePayloadSchema,
  }),
  z.object({
    intent: z.literal("create_budget"),
    ...intentFields,
    payload: CreateBudgetPayloadSchema,
  }),
  z.object({
    intent: z.literal("create_absence"),
    ...intentFields,
    payload: CreateAbsencePayloadSchema,
  }),
  z.object({
    intent: z.literal("cancel_absence"),
    ...intentFields,
    payload: CancelAbsencePayloadSchema,
  }),
  z.object({
    intent: z.literal("set_task_deadline"),
    ...intentFields,
    payload: SetTaskDeadlinePayloadSchema,
  }),
  z.object({
    intent: z.literal("complete_task"),
    ...intentFields,
    payload: CompleteTaskPayloadSchema,
  }),
  z.object({
    intent: z.literal("cancel_task"),
    ...intentFields,
    payload: CancelTaskPayloadSchema,
  }),
  z.object({
    intent: z.literal("start_task"),
    ...intentFields,
    payload: StartTaskPayloadSchema,
  }),
  z.object({
    intent: z.literal("add_task_comment"),
    ...intentFields,
    payload: AddTaskCommentPayloadSchema,
  }),
  z.object({
    intent: z.literal("list_task_comments"),
    ...intentFields,
    payload: ListTaskCommentsPayloadSchema,
  }),
  z.object({
    intent: z.literal("mention_in_task"),
    ...intentFields,
    payload: MentionInTaskPayloadSchema,
  }),
  z.object({
    intent: z.literal("transfer_task"),
    ...intentFields,
    payload: TransferTaskPayloadSchema,
  }),
  z.object({
    intent: z.literal("reassign_task"),
    ...intentFields,
    payload: ReassignTaskPayloadSchema,
  }),
  z.object({
    intent: z.literal("list_my_tasks"),
    ...intentFields,
    payload: ListMyTasksPayloadSchema,
  }),
  z.object({
    intent: z.literal("list_user_tasks"),
    ...intentFields,
    payload: ListUserTasksPayloadSchema,
  }),
  z.object({
    intent: z.literal("list_my_completed_tasks"),
    ...intentFields,
    payload: ListMyCompletedTasksPayloadSchema,
  }),
  z.object({
    intent: z.literal("list_user_completed_tasks"),
    ...intentFields,
    payload: ListUserCompletedTasksPayloadSchema,
  }),
  z.object({
    intent: z.literal("list_pending_expenses"),
    ...intentFields,
    payload: ListPendingExpensesPayloadSchema,
  }),
  z.object({
    intent: z.literal("unknown"),
    ...intentFields,
    payload: UnknownPayloadSchema,
  }),
]);

export type AiIntent = z.infer<typeof AiIntentSchema>;
export type CreateTaskPayload = z.infer<typeof CreateTaskPayloadSchema>;
export type CreateNotePayload = z.infer<typeof CreateNotePayloadSchema>;
export type CreateExpensePayload = z.infer<typeof CreateExpensePayloadSchema>;
export type CreateBudgetPayload = z.infer<typeof CreateBudgetPayloadSchema>;
export type CreateAbsencePayload = z.infer<typeof CreateAbsencePayloadSchema>;
export type CancelAbsencePayload = z.infer<typeof CancelAbsencePayloadSchema>;
export type SetTaskDeadlinePayload = z.infer<typeof SetTaskDeadlinePayloadSchema>;
export type CompleteTaskPayload = z.infer<typeof CompleteTaskPayloadSchema>;
export type CancelTaskPayload = z.infer<typeof CancelTaskPayloadSchema>;
export type StartTaskPayload = z.infer<typeof StartTaskPayloadSchema>;
export type AddTaskCommentPayload = z.infer<typeof AddTaskCommentPayloadSchema>;
export type ListTaskCommentsPayload = z.infer<typeof ListTaskCommentsPayloadSchema>;
export type MentionInTaskPayload = z.infer<typeof MentionInTaskPayloadSchema>;
export type TransferTaskPayload = z.infer<typeof TransferTaskPayloadSchema>;
export type ReassignTaskPayload = z.infer<typeof ReassignTaskPayloadSchema>;
export type ListMyTasksPayload = z.infer<typeof ListMyTasksPayloadSchema>;
export type ListUserTasksPayload = z.infer<typeof ListUserTasksPayloadSchema>;
export type ListMyCompletedTasksPayload = z.infer<typeof ListMyCompletedTasksPayloadSchema>;
export type ListUserCompletedTasksPayload = z.infer<typeof ListUserCompletedTasksPayloadSchema>;
export type ListPendingExpensesPayload = z.infer<typeof ListPendingExpensesPayloadSchema>;
export type UnknownPayload = z.infer<typeof UnknownPayloadSchema>;

/** Removes legacy fields and coerces common model mistakes before Zod parse. */
export function preprocessAiIntentInput(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }

  const obj = { ...(input as Record<string, unknown>) };

  delete obj.version;
  delete obj.action;
  delete obj.entity;
  delete obj.rawText;

  if (typeof obj.confidence === "string") {
    const n = Number(obj.confidence);
    if (!Number.isNaN(n)) obj.confidence = n;
  }

  if (obj.requiresConfirmation === undefined) {
    obj.requiresConfirmation = true;
  }

  return obj;
}

export function parseAiIntent(input: unknown): AiIntent {
  return AiIntentSchema.parse(preprocessAiIntentInput(input));
}

export function safeParseAiIntent(input: unknown) {
  return AiIntentSchema.safeParse(preprocessAiIntentInput(input));
}
