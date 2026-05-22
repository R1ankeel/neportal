import { z } from "zod";

const PLACEHOLDER_AI_STRINGS = new Set(["null", "undefined", "none", "nil"]);

/** Coerces model output: null / blank / "null" → undefined; non-empty strings → trimmed. */
export function preprocessOptionalAiString(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (PLACEHOLDER_AI_STRINGS.has(trimmed.toLowerCase())) return undefined;
    return trimmed;
  }
  return value;
}

export const optionalAiString = z.preprocess(
  preprocessOptionalAiString,
  z.string().optional(),
);

export const optionalAiStringMin1 = z.preprocess(
  preprocessOptionalAiString,
  z.string().min(1).optional(),
);

const deadlineDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const optionalAiDeadlineDate = z.preprocess(
  preprocessOptionalAiString,
  z
    .string()
    .regex(deadlineDateRegex, "deadlineDate must be YYYY-MM-DD")
    .optional(),
);
