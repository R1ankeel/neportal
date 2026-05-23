import { assertAiContractsSchemaLoaded, safeParseAiIntent, type AiIntent } from "./ai-contracts";
import { fixAiIntentBeforeValidation } from "./fix-ai-intent-deadline";
import {
  warnLongCreateTaskTitleWithoutDescription,
  warnLongInputWithoutDescription,
  warnPossibleLostDetailsInDescription,
} from "./normalize-create-task";
import { buildSystemPrompt } from "./ai/build-system-prompt";
import { resolvePromptGroup, type PromptGroup } from "./ai/prompt-group-router";
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
  };
};

export type ParseTextIntentResult =
  | { ok: true; intent: AiIntent }
  | { ok: false; kind: "disabled" | "api_error" | "invalid_json" | "invalid_schema" };

export async function parseTextIntent(
  userText: string,
  options?: ParseTextIntentOptions,
): Promise<ParseTextIntentResult> {
  assertAiContractsSchemaLoaded();

  const state = getYandexGptState();
  if (!state.enabled) {
    return { ok: false, kind: "disabled" };
  }

  const promptGroup = resolvePromptGroup(userText);
  const systemPrompt = buildSystemPrompt(promptGroup);

  let context: IntentPromptContext;
  try {
    context = await loadIntentPromptContext(promptGroup, options);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] failed to load context: ${msg}`);
    return { ok: false, kind: "api_error" };
  }

  const userPrompt = [
    formatPromptContextForModel(context, promptGroup),
    "",
    "Текст пользователя:",
    userText.trim(),
  ].join("\n");

  const promptChars = systemPrompt.length + userPrompt.length;
  yandexGptDevLog(`promptGroup=${promptGroup} promptChars=${promptChars}`);

  let responseText: string;
  try {
    responseText = await callYandexGpt(state.config, systemPrompt, userPrompt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] request failed: ${msg}`);
    return { ok: false, kind: "api_error" };
  }

  const logPromptFailure = async (
    reason: YandexPromptLogReason,
    extra?: Record<string, unknown>,
  ): Promise<void> => {
    const logFile = await saveYandexGptPromptLog({
      reason,
      userText: userText.trim(),
      systemPrompt,
      userPrompt,
      modelResponse: responseText,
      modelUri: state.config.modelUri,
      extra: { promptGroup, ...extra },
    });
    yandexGptDevLog("prompt saved to log file", {
      reason,
      promptGroup,
      logFile: logFile ?? "save failed",
    });
  };

  const jsonText = extractJsonText(responseText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const reason: YandexPromptLogReason = isYandexGptRefusalResponse(responseText)
      ? "api_refusal"
      : "invalid_json";
    await logPromptFailure(reason, { jsonPreview: jsonText.slice(0, 500) });
    yandexGptDevLog(
      reason === "api_refusal" ? "model refusal/non-json" : "model returned non-JSON text",
      { promptGroup, preview: jsonText.slice(0, 500) },
    );
    return { ok: false, kind: "invalid_json" };
  }

  yandexGptDevLog("raw AI JSON before validation", { parsed });

  const fixed = fixAiIntentBeforeValidation(parsed, {
    baseDate: context.currentDate,
    userText: userText.trim(),
  });
  if (fixed !== parsed) {
    yandexGptDevLog("intent fields coerced before validation", { fixed });
  }

  const validated = safeParseAiIntent(fixed);
  if (!validated.success) {
    await logPromptFailure("invalid_schema", {
      fieldErrors: validated.error.flatten().fieldErrors,
      formErrors: validated.error.flatten().formErrors,
      parsed: fixed,
    });
    yandexGptDevLog("validation error", {
      fieldErrors: validated.error.flatten().fieldErrors,
      formErrors: validated.error.flatten().formErrors,
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
  yandexGptDevLog("parsed intent", {
    intent: intent.intent,
    confidence: intent.confidence,
    requiresConfirmation: intent.requiresConfirmation,
    payload: intent.payload,
  });

  return { ok: true, intent };
}

async function callYandexGpt(
  config: YandexGptConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
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

  return text;
}
