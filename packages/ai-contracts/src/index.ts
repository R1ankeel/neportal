import { z } from "zod";

export const AiIntentNameSchema = z.enum([
  "create_task",
  "create_note",
  "create_expense",
  "create_absence",
  "set_task_deadline",
  "complete_task",
  "cancel_task",
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
  projectHint: z.string().optional(),
  assigneeHint: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  deadlineDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "deadlineDate must be YYYY-MM-DD")
    .optional(),
});

export const CreateNotePayloadSchema = z.object({
  projectHint: z.string().optional(),
  text: z.string().min(1),
});

export const CreateExpensePayloadSchema = z.object({
  projectHint: z.string().optional(),
  budgetHint: z.string().optional(),
  amount: z.number().positive(),
  description: z.string().optional(),
});

export const CreateAbsencePayloadSchema = z.object({
  userHint: z.string().optional(),
  type: AbsenceTypeSchema,
  startDate: z.string().optional(),
  endDate: z.string(),
  documentNumber: z.string().optional(),
  comment: z.string().optional(),
});

export const SetTaskDeadlinePayloadSchema = z.object({
  taskTitle: z.string().min(1),
  deadlineDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "deadlineDate must be YYYY-MM-DD"),
});

export const CompleteTaskPayloadSchema = z.object({
  taskTitle: z.string().min(1),
});

export const CancelTaskPayloadSchema = z.object({
  taskTitle: z.string().min(1),
});

export const UnknownPayloadSchema = z.object({
  reason: z.string().optional(),
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
    intent: z.literal("create_absence"),
    ...intentFields,
    payload: CreateAbsencePayloadSchema,
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
    intent: z.literal("unknown"),
    ...intentFields,
    payload: UnknownPayloadSchema,
  }),
]);

export type AiIntent = z.infer<typeof AiIntentSchema>;
export type CreateTaskPayload = z.infer<typeof CreateTaskPayloadSchema>;
export type CreateNotePayload = z.infer<typeof CreateNotePayloadSchema>;
export type CreateExpensePayload = z.infer<typeof CreateExpensePayloadSchema>;
export type CreateAbsencePayload = z.infer<typeof CreateAbsencePayloadSchema>;
export type SetTaskDeadlinePayload = z.infer<typeof SetTaskDeadlinePayloadSchema>;
export type CompleteTaskPayload = z.infer<typeof CompleteTaskPayloadSchema>;
export type CancelTaskPayload = z.infer<typeof CancelTaskPayloadSchema>;
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
