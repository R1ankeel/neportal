import { parseYandexGptUsage } from "../../yandex-gpt-usage";
import type { AiCompletionParams, AiCompletionResult, AiProvider, AiProviderState } from "./types";

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

export function getYandexAiProviderState(): AiProviderState {
  const state = getYandexGptState();
  if (!state.enabled) {
    return { enabled: false, providerId: "yandex", reason: state.reason };
  }
  return {
    enabled: true,
    providerId: "yandex",
    model: state.config.modelUri,
  };
}

async function callYandexCompletion(
  config: YandexGptConfig,
  params: AiCompletionParams,
): Promise<AiCompletionResult> {
  const startedAt = Date.now();
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
        temperature: params.temperature ?? 0.2,
        maxTokens: params.maxTokens ?? 2000,
      },
      messages: [
        { role: "system", text: params.systemPrompt },
        { role: "user", text: params.userPrompt },
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
    raw: data,
    model: config.modelUri,
    provider: "yandex",
    latencyMs: Date.now() - startedAt,
  };
}

/** HTTP-адаптер YandexGPT Foundation Models API. */
export function createYandexGptProvider(): AiProvider {
  const state = getYandexGptState();
  const config = state.enabled ? state.config : null;

  return {
    id: "yandex",
    async complete(params: AiCompletionParams): Promise<AiCompletionResult> {
      if (!config) {
        throw new Error("YandexGPT is not configured (missing env)");
      }
      return callYandexCompletion(config, params);
    },
  };
}
