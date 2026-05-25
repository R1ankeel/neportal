import { assertAiContractsSchemaLoaded, safeParseAiIntent, type AiIntent } from "./ai-contracts";
import { parseClassifierResult } from "./ai/classifier-schema";
import { buildSystemPrompt, measureSystemPrompt } from "./ai/build-system-prompt";
import {
  intentToExtractorGroup,
  type ExtractorPromptGroup,
} from "./ai/intent-to-prompt-group";
import { resolveCompletionMaxTokens } from "./ai/completion-max-tokens";
import { logAiProviderError } from "./ai/provider/http";
import { getAiProviderState, getPrimaryAiProvider } from "./ai/provider/registry";
import type { AiProvider } from "./ai/provider/types";
import { resolvePromptGroup, type PromptGroup } from "./ai/prompt-group-router";
import { fixAiIntentBeforeValidation } from "./fix-ai-intent-deadline";
import {
  warnLongCreateTaskTitleWithoutDescription,
  warnLongInputWithoutDescription,
  warnPossibleLostDetailsInDescription,
} from "./normalize-create-task";
import {
  countPromptContextStats,
  formatPromptContextForModel,
  loadIntentPromptContext,
  type IntentPromptContext,
  type LoadIntentPromptContextOptions,
} from "./intent-context";
import {
  isYandexGptRefusalResponse,
  saveYandexGptPromptLog,
  type YandexPromptLogReason,
} from "./yandex-gpt-prompt-log";
import {
  addTokenUsage,
  logYandexGptTokenUsage,
  logYandexGptTokenUsageTotal,
  type YandexGptTokenUsage,
} from "./yandex-gpt-usage";

export type {
  YandexGptAuthMode,
  YandexGptConfig,
  YandexGptDisabledReason,
  YandexGptState,
} from "./ai/provider/yandex-provider";
export { getYandexGptState } from "./ai/provider/yandex-provider";

export type { PromptGroup };
export type ParseTextIntentOptions = LoadIntentPromptContextOptions;

export type ParseTextIntentResult =
  | { ok: true; intent: AiIntent }
  | { ok: false; kind: "disabled" | "api_error" | "invalid_json" | "invalid_schema" };

type GptCallResult =
  | { ok: true; responseText: string; parsed: unknown; usage: YandexGptTokenUsage | null }
  | { ok: false; kind: "invalid_json" | "invalid_schema" };

/** Dev-only logs (отключить: BOT_DEV_LOG=0). */
function yandexGptDevLog(message: string, data?: Record<string, unknown>): void {
  if (process.env.BOT_DEV_LOG === "0") return;
  if (data && Object.keys(data).length > 0) {
    console.log(`[yandex-gpt] ${message}`, data);
  } else {
    console.log(`[yandex-gpt] ${message}`);
  }
}

/** Извлекает JSON из ответа модели, в т.ч. из блока ```json ... ```. */
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function buildUserPrompt(context: IntentPromptContext, group: PromptGroup, userText: string): string {
  return [
    formatPromptContextForModel(context, group, userText),
    "",
    "Текст пользователя:",
    userText.trim(),
  ].join("\n");
}

function unknownIntent(confidence: number): AiIntent {
  return {
    intent: "unknown",
    confidence,
    requiresConfirmation: false,
    payload: {},
  };
}

async function runGptJsonCall(params: {
  provider: AiProvider;
  modelUri?: string;
  promptGroup: string;
  systemPrompt: string;
  userPrompt: string;
  userText: string;
  validate?: (parsed: unknown) => boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<GptCallResult & { systemPrompt: string; userPrompt: string }> {
  const {
    provider,
    modelUri,
    promptGroup,
    systemPrompt,
    userPrompt,
    userText,
    validate,
    temperature,
    maxTokens: maxTokensParam,
  } = params;
  const maxTokens = maxTokensParam ?? resolveCompletionMaxTokens(promptGroup);
  const systemChars = systemPrompt.length;
  const userChars = userPrompt.length;
  const promptChars = systemChars + userChars;
  const promptMeasure = measureSystemPrompt(promptGroup);
  yandexGptDevLog(`promptGroup=${promptGroup} promptChars=${promptChars} maxTokens=${maxTokens}`, {
    provider: provider.id,
    modelUri: modelUri ?? undefined,
    systemChars,
    userChars,
    systemPromptChars: promptMeasure.systemChars,
    groupPromptChars: promptMeasure.groupChars,
  });

  let completion;
  try {
    completion = await provider.complete({
      systemPrompt,
      userPrompt,
      temperature,
      maxTokens,
      promptGroup,
      requestLabel: promptGroup,
    });
  } catch (e) {
    logAiProviderError(e, { promptGroup, provider: provider.id });
    throw e;
  }

  const usage = completion.usage;
  logYandexGptTokenUsage(promptGroup, usage, {
    provider: completion.provider,
    model: completion.model ?? modelUri,
    latencyMs: completion.latencyMs,
  });
  const responseText = completion.text;

  const jsonText = extractJsonText(responseText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const reason: YandexPromptLogReason = isYandexGptRefusalResponse(responseText)
      ? "api_refusal"
      : "invalid_json";
    const logFile = await saveYandexGptPromptLog({
      reason,
      userText: userText.trim(),
      systemPrompt,
      userPrompt,
      modelResponse: responseText,
      modelUri: completion.model ?? modelUri,
      extra: {
        promptGroup,
        provider: completion.provider,
        usage,
        jsonPreview: jsonText.slice(0, 500),
      },
    });
    yandexGptDevLog(
      reason === "api_refusal" ? "model refusal/non-json" : "model returned non-JSON text",
      {
        promptGroup,
        provider: completion.provider,
        preview: jsonText.slice(0, 500),
        logFile: logFile ?? "save failed",
      },
    );
    return { ok: false, kind: "invalid_json", systemPrompt, userPrompt };
  }

  if (validate && !validate(parsed)) {
    const logFile = await saveYandexGptPromptLog({
      reason: "invalid_schema",
      userText: userText.trim(),
      systemPrompt,
      userPrompt,
      modelResponse: responseText,
      modelUri: completion.model ?? modelUri,
      extra: {
        promptGroup,
        provider: completion.provider,
        usage,
        parsed,
      },
    });
    yandexGptDevLog("validation error", {
      promptGroup,
      provider: completion.provider,
      parsed,
      logFile: logFile ?? "save failed",
    });
    return { ok: false, kind: "invalid_schema", systemPrompt, userPrompt };
  }

  return { ok: true, responseText, parsed, usage, systemPrompt, userPrompt };
}

/** JSON completion через primary AiProvider. */
export async function requestAiJson(params: {
  promptGroup: string;
  systemPrompt: string;
  userPrompt: string;
  userText: string;
  validate?: (parsed: unknown) => boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<
  | { ok: true; parsed: unknown; responseText: string }
  | { ok: false; kind: "invalid_json" | "invalid_schema" }
> {
  const providerState = getAiProviderState();
  if (!providerState.enabled) {
    return { ok: false, kind: "invalid_json" };
  }

  const provider = getPrimaryAiProvider();
  const gptResult = await runGptJsonCall({
    provider,
    modelUri: providerState.model,
    promptGroup: params.promptGroup,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    userText: params.userText,
    validate: params.validate,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });

  if (!gptResult.ok) {
    return { ok: false, kind: gptResult.kind };
  }

  return { ok: true, parsed: gptResult.parsed, responseText: gptResult.responseText };
}

/**
 * @deprecated Используйте requestAiJson. config оставлен для совместимости и игнорируется.
 */
export async function requestYandexGptJson(params: {
  config?: unknown;
  promptGroup: string;
  systemPrompt: string;
  userPrompt: string;
  userText: string;
  validate?: (parsed: unknown) => boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<
  | { ok: true; parsed: unknown; responseText: string }
  | { ok: false; kind: "invalid_json" | "invalid_schema" }
> {
  return requestAiJson({
    promptGroup: params.promptGroup,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    userText: params.userText,
    validate: params.validate,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });
}

function logIntentParseMetrics(data: Record<string, unknown>): void {
  yandexGptDevLog("intent-parse metrics", data);
}

async function runClassifier(
  provider: AiProvider,
  modelUri: string | undefined,
  userText: string,
  options?: ParseTextIntentOptions,
): Promise<
  | { ok: true; extractorGroup: ExtractorPromptGroup; usage: YandexGptTokenUsage | null }
  | { ok: true; intent: AiIntent; usage: YandexGptTokenUsage | null }
  | { ok: false; kind: "invalid_json" | "invalid_schema" | "api_error" }
> {
  const promptGroup: PromptGroup = "classifier";
  let context: IntentPromptContext;
  try {
    context = await loadIntentPromptContext(promptGroup, {
      ...options,
      userText,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] failed to load classifier context: ${msg}`);
    return { ok: false, kind: "api_error" };
  }

  const systemPrompt = buildSystemPrompt(promptGroup);
  const userPrompt = buildUserPrompt(context, promptGroup, userText);

  let gptResult: GptCallResult & { systemPrompt: string; userPrompt: string };
  try {
    gptResult = await runGptJsonCall({
      provider,
      modelUri,
      promptGroup,
      systemPrompt,
      userPrompt,
      userText,
      validate: (parsed) => parseClassifierResult(parsed) !== null,
      maxTokens: resolveCompletionMaxTokens(promptGroup),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] classifier request failed: ${msg}`);
    return { ok: false, kind: "api_error" };
  }

  if (!gptResult.ok) {
    return { ok: false, kind: gptResult.kind };
  }

  const classified = parseClassifierResult(gptResult.parsed)!;
  yandexGptDevLog(`classifier intent=${classified.intent}`, {
    confidence: classified.confidence,
    provider: provider.id,
  });

  if (classified.intent === "unknown") {
    return { ok: true, intent: unknownIntent(classified.confidence), usage: gptResult.usage };
  }

  const extractorGroup = intentToExtractorGroup(classified.intent);
  if (!extractorGroup) {
    return { ok: true, intent: unknownIntent(classified.confidence), usage: gptResult.usage };
  }

  yandexGptDevLog(`extractor promptGroup=${extractorGroup}`);
  return { ok: true, extractorGroup, usage: gptResult.usage };
}

async function runExtractor(
  provider: AiProvider,
  modelUri: string | undefined,
  extractorGroup: ExtractorPromptGroup,
  userText: string,
  options?: ParseTextIntentOptions,
): Promise<
  | {
      ok: true;
      parsed: unknown;
      context: IntentPromptContext;
      contextStats: ReturnType<typeof countPromptContextStats>;
      usage: YandexGptTokenUsage | null;
    }
  | { ok: false; kind: "invalid_json" | "invalid_schema" | "api_error" }
> {
  let context: IntentPromptContext;
  try {
    context = await loadIntentPromptContext(extractorGroup, {
      ...options,
      userText,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] failed to load extractor context: ${msg}`);
    return { ok: false, kind: "api_error" };
  }

  const systemPrompt = buildSystemPrompt(extractorGroup);
  const userPrompt = buildUserPrompt(context, extractorGroup, userText);
  const contextStats = countPromptContextStats(context, userText);

  let gptResult: GptCallResult & { systemPrompt: string; userPrompt: string };
  try {
    gptResult = await runGptJsonCall({
      provider,
      modelUri,
      promptGroup: extractorGroup,
      systemPrompt,
      userPrompt,
      userText,
      maxTokens: resolveCompletionMaxTokens(extractorGroup),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] extractor request failed: ${msg}`);
    return { ok: false, kind: "api_error" };
  }

  if (!gptResult.ok) {
    return { ok: false, kind: gptResult.kind };
  }

  yandexGptDevLog("raw AI JSON before validation", {
    promptGroup: extractorGroup,
    provider: provider.id,
    parsed: gptResult.parsed,
  });

  return { ok: true, parsed: gptResult.parsed, context, usage: gptResult.usage, contextStats };
}

export async function parseTextIntent(
  userText: string,
  options?: ParseTextIntentOptions,
): Promise<ParseTextIntentResult> {
  assertAiContractsSchemaLoaded();

  const providerState = getAiProviderState();
  if (!providerState.enabled) {
    return { ok: false, kind: "disabled" };
  }

  const provider = getPrimaryAiProvider();
  const modelUri = providerState.model;

  const startedAt = Date.now();
  const routeGroup = resolvePromptGroup(userText);
  const classifierSkipped = routeGroup !== "classifier";
  let extractorGroup: ExtractorPromptGroup;
  let totalUsage: YandexGptTokenUsage | null = null;

  if (classifierSkipped) {
    extractorGroup = routeGroup;
    yandexGptDevLog("classifier skipped", { routeGroup, provider: provider.id });
  } else {
    const classified = await runClassifier(provider, modelUri, userText, {
      ...options,
      userText,
    });
    if (!classified.ok) {
      return { ok: false, kind: classified.kind };
    }
    totalUsage = addTokenUsage(totalUsage, classified.usage);
    if ("intent" in classified) {
      logYandexGptTokenUsageTotal(totalUsage);
      logIntentParseMetrics({
        routeGroup,
        classifierSkipped: false,
        promptGroup: "classifier",
        provider: provider.id,
        latencyMs: Date.now() - startedAt,
        modelUri,
        maxTokens: resolveCompletionMaxTokens("classifier"),
      });
      return { ok: true, intent: classified.intent };
    }
    extractorGroup = classified.extractorGroup;
  }

  const extracted = await runExtractor(provider, modelUri, extractorGroup, userText, {
    ...options,
    userText,
  });
  totalUsage = addTokenUsage(totalUsage, extracted.ok ? extracted.usage : null);
  if (!extracted.ok) {
    return { ok: false, kind: extracted.kind };
  }

  const fixed = fixAiIntentBeforeValidation(extracted.parsed, {
    baseDate: extracted.context.currentDate,
    userText: userText.trim(),
  });

  const validated = safeParseAiIntent(fixed);
  if (!validated.success) {
    const logFile = await saveYandexGptPromptLog({
      reason: "invalid_schema",
      userText: userText.trim(),
      systemPrompt: buildSystemPrompt(extractorGroup),
      userPrompt: buildUserPrompt(
        extracted.context,
        extractorGroup,
        userText,
      ),
      modelResponse: JSON.stringify(extracted.parsed),
      modelUri,
      extra: {
        promptGroup: extractorGroup,
        provider: provider.id,
        fieldErrors: validated.error.flatten().fieldErrors,
        formErrors: validated.error.flatten().formErrors,
        parsed: fixed,
      },
    });
    yandexGptDevLog("validation error", {
      promptGroup: extractorGroup,
      provider: provider.id,
      fieldErrors: validated.error.flatten().fieldErrors,
      formErrors: validated.error.flatten().formErrors,
      logFile: logFile ?? "save failed",
    });
    return { ok: false, kind: "invalid_schema" };
  }

  const intent = validated.data;
  if (intent.intent === "create_task") {
    const userTextTrimmed = userText.trim();
    warnLongInputWithoutDescription(userTextTrimmed, intent.payload.description);
    warnLongCreateTaskTitleWithoutDescription(
      intent.payload.title,
      intent.payload.description,
    );
    warnPossibleLostDetailsInDescription(
      userTextTrimmed,
      intent.payload.description,
    );
  }

  logYandexGptTokenUsageTotal(totalUsage);

  const contextStats = extracted.contextStats;
  const promptMeasure = measureSystemPrompt(extractorGroup);
  logIntentParseMetrics({
    routeGroup,
    classifierSkipped,
    promptGroup: extractorGroup,
    provider: provider.id,
    latencyMs: Date.now() - startedAt,
    modelUri,
    maxTokens: resolveCompletionMaxTokens(extractorGroup),
    systemPromptChars: promptMeasure.systemChars,
    groupPromptChars: promptMeasure.groupChars,
    contextUsers: contextStats.users,
    contextAliases: contextStats.aliasCount,
    contextTasks: contextStats.tasks,
    contextBudgets: contextStats.budgets,
    contextProjects: contextStats.projects,
    usage: totalUsage,
  });

  yandexGptDevLog("parsed intent", {
    promptGroup: extractorGroup,
    provider: provider.id,
    intent: intent.intent,
    confidence: intent.confidence,
    requiresConfirmation: intent.requiresConfirmation,
    payload: intent.payload,
  });

  return { ok: true, intent };
}
