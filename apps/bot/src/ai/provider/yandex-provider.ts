import { parseYandexGptUsage } from "../../yandex-gpt-usage";
import { AiProviderError } from "./errors";
import { requestProviderHttp } from "./http";
import { buildProviderDiagnosticsBase, getProviderHttpSettings } from "./provider-config";
import type { AiCompletionParams, AiCompletionResult, AiProvider, AiProviderState } from "./types";

export const YANDEX_COMPLETION_URL =
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

  if (process.env.BOT_DEV_LOG !== "0") {
    console.log(`[yandex-gpt] auth mode: ${auth.authMode}`);
  }

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

export function yandexStateForDiagnostics(state: YandexGptState): Record<string, unknown> {
  const http = getProviderHttpSettings();
  if (state.enabled) {
    return {
      provider: "yandex",
      configured: true,
      endpoint: YANDEX_COMPLETION_URL,
      authType: state.config.authMode,
      model: state.config.modelUri,
      timeoutMs: http.timeoutMs,
      maxRetries: http.maxRetries,
      retryBaseDelayMs: http.retryBaseDelayMs,
    };
  }
  const missingEnv: string[] = [];
  if (isPlaceholder(process.env.YANDEX_CLOUD_FOLDER_ID)) missingEnv.push("YANDEX_CLOUD_FOLDER_ID");
  if (!resolveAuth()) missingEnv.push("YANDEX_GPT_API_KEY or YANDEX_CLOUD_IAM_TOKEN");
  return {
    provider: "yandex",
    configured: false,
    endpoint: YANDEX_COMPLETION_URL,
    reason: state.reason,
    missingEnv,
    timeoutMs: http.timeoutMs,
    maxRetries: http.maxRetries,
    retryBaseDelayMs: http.retryBaseDelayMs,
  };
}

export function getYandexAiProviderState(): AiProviderState {
  const state = getYandexGptState();
  const base = buildProviderDiagnosticsBase("yandex");
  if (!state.enabled) {
    const missingEnv: string[] = [];
    if (isPlaceholder(process.env.YANDEX_CLOUD_FOLDER_ID)) missingEnv.push("YANDEX_CLOUD_FOLDER_ID");
    if (!resolveAuth()) missingEnv.push("YANDEX_GPT_API_KEY or YANDEX_CLOUD_IAM_TOKEN");
    return {
      enabled: false,
      providerId: "yandex",
      reason: state.reason,
      diagnostics: {
        ...base,
        configured: false,
        endpoint: YANDEX_COMPLETION_URL,
        reason: state.reason,
        missingEnv,
      },
    };
  }
  return {
    enabled: true,
    providerId: "yandex",
    model: state.config.modelUri,
    diagnostics: {
      ...base,
      configured: true,
      model: state.config.modelUri,
      endpoint: YANDEX_COMPLETION_URL,
      authType: state.config.authMode,
    },
  };
}

function parseYandexCompletionBody(
  bodyText: string,
  config: YandexGptConfig,
): AiCompletionResult {
  let data: YandexCompletionResponse;
  try {
    data = JSON.parse(bodyText) as YandexCompletionResponse;
  } catch {
    throw new AiProviderError({
      provider: "yandex",
      code: "AI_PROVIDER_RESPONSE_PARSE_ERROR",
      retryable: false,
      message: "provider=yandex code=AI_PROVIDER_RESPONSE_PARSE_ERROR",
    });
  }

  const text = data.result?.alternatives?.[0]?.message?.text;
  if (!text?.trim()) {
    throw new AiProviderError({
      provider: "yandex",
      code: "AI_PROVIDER_EMPTY_RESPONSE",
      retryable: false,
      message: "provider=yandex code=AI_PROVIDER_EMPTY_RESPONSE",
    });
  }

  return {
    text,
    usage: parseYandexGptUsage(data.result?.usage),
    raw: data,
    model: config.modelUri,
    provider: "yandex",
  };
}

async function callYandexCompletion(
  config: YandexGptConfig,
  params: AiCompletionParams,
): Promise<AiCompletionResult> {
  const startedAt = Date.now();
  const { bodyText } = await requestProviderHttp({
    provider: "yandex",
    url: YANDEX_COMPLETION_URL,
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
        temperature: params.temperature ?? 0.2,
        maxTokens: params.maxTokens ?? 2000,
      },
      messages: [
        { role: "system", text: params.systemPrompt },
        { role: "user", text: params.userPrompt },
      ],
    }),
    promptGroup: params.promptGroup,
  });

  const result = parseYandexCompletionBody(bodyText, config);
  return { ...result, latencyMs: Date.now() - startedAt };
}

/** HTTP-адаптер YandexGPT Foundation Models API. */
export function createYandexGptProvider(): AiProvider {
  const state = getYandexGptState();
  const config = state.enabled ? state.config : null;

  return {
    id: "yandex",
    async complete(params: AiCompletionParams): Promise<AiCompletionResult> {
      if (!config) {
        throw new AiProviderError({
          provider: "yandex",
          code: "AI_PROVIDER_NOT_CONFIGURED",
          retryable: false,
          message:
            "provider=yandex code=AI_PROVIDER_NOT_CONFIGURED (missing YANDEX_CLOUD_FOLDER_ID or auth)",
        });
      }
      return callYandexCompletion(config, params);
    },
  };
}
