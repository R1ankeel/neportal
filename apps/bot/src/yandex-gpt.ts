import { assertAiContractsSchemaLoaded, safeParseAiIntent, type AiIntent } from "./ai-contracts";
import { parseClassifierResult } from "./ai/classifier-schema";
import { buildSystemPrompt } from "./ai/build-system-prompt";
import {
  intentToExtractorGroup,
  type ExtractorPromptGroup,
} from "./ai/intent-to-prompt-group";
import { resolvePromptGroup, type PromptGroup } from "./ai/prompt-group-router";
import { fixAiIntentBeforeValidation } from "./fix-ai-intent-deadline";
import {
  warnLongCreateTaskTitleWithoutDescription,
  warnLongInputWithoutDescription,
  warnPossibleLostDetailsInDescription,
} from "./normalize-create-task";
import {
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
  parseYandexGptUsage,
  type YandexGptTokenUsage,
} from "./yandex-gpt-usage";

export type { PromptGroup };
export type ParseTextIntentOptions = LoadIntentPromptContextOptions;

const YANDEX_COMPLETION_URL =
  "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";

export type YandexGptAuthMode = "api-key" | "iam-token";

export type YandexGptConfig = {
  folderId: string;
  modelUri: string;
  authMode: YandexGptAuthMode;
  /** API key (Api-Key) or IAM token (Bearer), never logged. */
  credential: string;
};

export type YandexGptDisabledReason = "missing_env" | "placeholder_env";

export type YandexGptState =
  | { enabled: true; config: YandexGptConfig }
  | { enabled: false; reason: YandexGptDisabledReason };

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  return v.length === 0 || v === "change_me";
}

function resolveAuth(): { authMode: YandexGptAuthMode; credential: string } | null {
  const apiKey = process.env.YANDEX_GPT_API_KEY?.trim();
  if (!isPlaceholder(apiKey)) {
    return { authMode: "api-key", credential: apiKey! };
  }

  const iamToken = process.env.YANDEX_CLOUD_IAM_TOKEN?.trim();
  if (!isPlaceholder(iamToken)) {
    return { authMode: "iam-token", credential: iamToken! };
  }

  return null;
}

function buildAuthorizationHeader(config: YandexGptConfig): string {
  if (config.authMode === "api-key") {
    return `Api-Key ${config.credential}`;
  }
  return `Bearer ${config.credential}`;
}

export function getYandexGptState(): YandexGptState {
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID?.trim();
  const modelUriRaw = process.env.YANDEX_GPT_MODEL_URI?.trim();

  if (isPlaceholder(folderId)) {
    return { enabled: false, reason: "missing_env" };
  }

  const auth = resolveAuth();
  if (!auth) {
    return { enabled: false, reason: "missing_env" };
  }

  const modelUri = isPlaceholder(modelUriRaw)
    ? `gpt://${folderId}/yandexgpt/latest`
    : modelUriRaw!;

  console.log(`[yandex-gpt] auth mode: ${auth.authMode}`);

  return {
    enabled: true,
    config: {
      folderId: folderId!,
      modelUri,
      authMode: auth.authMode,
      credential: auth.credential,
    },
  };
}

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

type YandexCompletionResponse = {
  result?: {
    alternatives?: Array<{
      message?: { text?: string };
      status?: string;
    }>;
    usage?: {
      inputTextTokens?: number | string;
      completionTokens?: number | string;
      totalTokens?: number | string;
    };
  };
};

type YandexGptCallResult = {
  text: string;
  usage: YandexGptTokenUsage | null;
};

export type ParseTextIntentResult =
  | { ok: true; intent: AiIntent }
  | { ok: false; kind: "disabled" | "api_error" | "invalid_json" | "invalid_schema" };

type GptCallResult =
  | { ok: true; responseText: string; parsed: unknown; usage: YandexGptTokenUsage | null }
  | { ok: false; kind: "invalid_json" | "invalid_schema" };

async function callYandexGpt(
  config: YandexGptConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<YandexGptCallResult> {
  const res = await fetch(YANDEX_COMPLETION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: buildAuthorizationHeader(config),
      "x-folder-id": config.folderId,
    },
    body: JSON.stringify({
      modelUri: config.modelUri,
      completionOptions: {
        stream: false,
        temperature: 0.2,
        maxTokens: 2000,
      },
      messages: [
        { role: "system", text: systemPrompt },
        { role: "user", text: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YandexGPT HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as YandexCompletionResponse;
  const text = data.result?.alternatives?.[0]?.message?.text;
  if (!text?.trim()) {
    throw new Error("YandexGPT returned empty completion");
  }

  return {
    text,
    usage: parseYandexGptUsage(data.result?.usage),
  };
}

function buildUserPrompt(context: IntentPromptContext, group: PromptGroup, userText: string): string {
  return [
    formatPromptContextForModel(context, group),
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
  config: YandexGptConfig;
  promptGroup: PromptGroup;
  systemPrompt: string;
  userPrompt: string;
  userText: string;
  validate?: (parsed: unknown) => boolean;
}): Promise<GptCallResult & { systemPrompt: string; userPrompt: string }> {
  const { config, promptGroup, systemPrompt, userPrompt, userText, validate } = params;
  const promptChars = systemPrompt.length + userPrompt.length;
  yandexGptDevLog(`promptGroup=${promptGroup} promptChars=${promptChars}`);

  let callResult: YandexGptCallResult;
  try {
    callResult = await callYandexGpt(config, systemPrompt, userPrompt);
  } catch (e) {
    throw e;
  }

  logYandexGptTokenUsage(promptGroup, callResult.usage);
  const responseText = callResult.text;

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
      modelUri: config.modelUri,
      extra: { promptGroup, usage: callResult.usage, jsonPreview: jsonText.slice(0, 500) },
    });
    yandexGptDevLog(
      reason === "api_refusal" ? "model refusal/non-json" : "model returned non-JSON text",
      { promptGroup, preview: jsonText.slice(0, 500), logFile: logFile ?? "save failed" },
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
      modelUri: config.modelUri,
      extra: { promptGroup, usage: callResult.usage, parsed },
    });
    yandexGptDevLog("validation error", {
      promptGroup,
      parsed,
      logFile: logFile ?? "save failed",
    });
    return { ok: false, kind: "invalid_schema", systemPrompt, userPrompt };
  }

  return { ok: true, responseText, parsed, usage: callResult.usage, systemPrompt, userPrompt };
}

async function runClassifier(
  config: YandexGptConfig,
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
    context = await loadIntentPromptContext(promptGroup, options);
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
      config,
      promptGroup,
      systemPrompt,
      userPrompt,
      userText,
      validate: (parsed) => parseClassifierResult(parsed) !== null,
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
  config: YandexGptConfig,
  extractorGroup: ExtractorPromptGroup,
  userText: string,
  options?: ParseTextIntentOptions,
): Promise<
  | { ok: true; parsed: unknown; context: IntentPromptContext; usage: YandexGptTokenUsage | null }
  | { ok: false; kind: "invalid_json" | "invalid_schema" | "api_error" }
> {
  let context: IntentPromptContext;
  try {
    context = await loadIntentPromptContext(extractorGroup, options);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] failed to load extractor context: ${msg}`);
    return { ok: false, kind: "api_error" };
  }

  const systemPrompt = buildSystemPrompt(extractorGroup);
  const userPrompt = buildUserPrompt(context, extractorGroup, userText);

  let gptResult: GptCallResult & { systemPrompt: string; userPrompt: string };
  try {
    gptResult = await runGptJsonCall({
      config,
      promptGroup: extractorGroup,
      systemPrompt,
      userPrompt,
      userText,
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
    parsed: gptResult.parsed,
  });

  return { ok: true, parsed: gptResult.parsed, context, usage: gptResult.usage };
}

export async function parseTextIntent(
  userText: string,
  options?: ParseTextIntentOptions,
): Promise<ParseTextIntentResult> {
  assertAiContractsSchemaLoaded();

  const state = getYandexGptState();
  if (!state.enabled) {
    return { ok: false, kind: "disabled" };
  }

  const routeGroup = resolvePromptGroup(userText);
  let extractorGroup: ExtractorPromptGroup;
  let totalUsage: YandexGptTokenUsage | null = null;

  if (routeGroup !== "classifier") {
    extractorGroup = routeGroup;
  } else {
    const classified = await runClassifier(state.config, userText, options);
    if (!classified.ok) {
      return { ok: false, kind: classified.kind };
    }
    totalUsage = addTokenUsage(totalUsage, classified.usage);
    if ("intent" in classified) {
      logYandexGptTokenUsageTotal(totalUsage);
      return { ok: true, intent: classified.intent };
    }
    extractorGroup = classified.extractorGroup;
  }

  const extracted = await runExtractor(state.config, extractorGroup, userText, options);
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
      modelUri: state.config.modelUri,
      extra: {
        promptGroup: extractorGroup,
        fieldErrors: validated.error.flatten().fieldErrors,
        formErrors: validated.error.flatten().formErrors,
        parsed: fixed,
      },
    });
    yandexGptDevLog("validation error", {
      promptGroup: extractorGroup,
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

  yandexGptDevLog("parsed intent", {
    promptGroup: extractorGroup,
    intent: intent.intent,
    confidence: intent.confidence,
    requiresConfirmation: intent.requiresConfirmation,
    payload: intent.payload,
  });

  return { ok: true, intent };
}
