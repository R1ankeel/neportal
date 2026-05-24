import type { PromptGroup } from "./prompt-group-router";

/** Дефолтные лимиты output tokens по группе промпта (intent JSON короткий). */
const PROMPT_GROUP_MAX_TOKENS: Record<PromptGroup, number> = {
  classifier: 256,
  "task-list": 256,
  expense: 384,
  absence: 384,
  collaboration: 512,
  "task-status": 384,
  "create-task-rich": 768,
  "create-note": 384,
};

const DEFAULT_MAX_TOKENS = 512;

function parseEnvMaxTokensOverride(): number | null {
  const raw = process.env.AI_COMPLETION_MAX_TOKENS?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** Лимит completion tokens: env override → группа → fallback. */
export function resolveCompletionMaxTokens(promptGroup: string): number {
  const envOverride = parseEnvMaxTokensOverride();
  if (envOverride !== null) return envOverride;

  if (Object.prototype.hasOwnProperty.call(PROMPT_GROUP_MAX_TOKENS, promptGroup)) {
    return PROMPT_GROUP_MAX_TOKENS[promptGroup as PromptGroup];
  }

  return DEFAULT_MAX_TOKENS;
}
