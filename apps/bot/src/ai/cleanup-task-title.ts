import { TASK_TITLE_CLEANUP_PROMPT } from "./prompts/task-title-cleanup-prompt";
import { normalizeBasicTaskTitle } from "./deterministic/basic-create-task-text";
import { getYandexGptState, requestYandexGptJson } from "../yandex-gpt";

function isValidCleanupPayload(parsed: unknown): parsed is { title: string } {
  if (!parsed || typeof parsed !== "object") return false;
  const title = (parsed as { title?: unknown }).title;
  return typeof title === "string" && title.trim().length > 0;
}

/** Лёгкий LLM-cleanup короткого title (без assignee). */
export async function cleanupTaskTitleWithAi(rawTitle: string): Promise<string> {
  const trimmed = rawTitle.trim();
  if (!trimmed) return trimmed;

  const state = getYandexGptState();
  if (!state.enabled) {
    return normalizeBasicTaskTitle(trimmed);
  }

  const userPrompt = `Текст задачи:\n${trimmed}`;
  const result = await requestYandexGptJson({
    config: state.config,
    promptGroup: "task-title-cleanup",
    systemPrompt: TASK_TITLE_CLEANUP_PROMPT,
    userPrompt,
    userText: trimmed,
    temperature: 0,
    maxTokens: 64,
    validate: isValidCleanupPayload,
  });

  if (!result.ok || !isValidCleanupPayload(result.parsed)) {
    return normalizeBasicTaskTitle(trimmed);
  }

  return result.parsed.title.trim();
}
