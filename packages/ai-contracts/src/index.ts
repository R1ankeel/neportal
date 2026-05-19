import { z } from "zod";

export const AiIntentSchema = z.object({
  version: z.literal(1),
  action: z.enum(["create", "read", "update", "delete", "unknown"]),
  entity: z.string().min(1).max(128),
  confidence: z.number().min(0).max(1).optional(),
  rawText: z.string().max(8000).optional(),
});

export type AiIntent = z.infer<typeof AiIntentSchema>;

export function parseAiIntent(input: unknown): AiIntent {
  return AiIntentSchema.parse(input);
}

export function safeParseAiIntent(input: unknown) {
  return AiIntentSchema.safeParse(input);
}
