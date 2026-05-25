import { AiProviderError } from "./errors";
import { requestProviderHttp } from "./http";
import { buildProviderDiagnosticsBase, getProviderHttpSettings } from "./provider-config";
import type { AiCompletionParams, AiCompletionResult, AiProvider, AiProviderState, AiTokenUsage } from "./types";

/** Yandex Cloud AI Studio — OpenAI-compatible endpoint. */
const DEFAULT_QWEN_BASE_URL = "https://ai.api.cloud.yandex.net/v1";
const DEFAULT_QWEN_AUTH_TYPE = "api-key";

export type QwenAuthType = "api-key" | "iam-token";

export type QwenConfig = {
  credential: string;
  authType: QwenAuthType;
  baseUrl: string;
  model: string;
  folderId?: string;
};

export type QwenDisabledReason = "missing_env" | "placeholder_env";

export type QwenState =
  | { enabled: true; config: QwenConfig }
  | {
      enabled: false;
      reason: QwenDisabledReason;
      baseUrl: string;
      model: string;
      authType: QwenAuthType;
      hasApiKey: boolean;
    };

type QwenChatCompletionResponse = {
  model?: string;
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number | string;
    completion_tokens?: number | string;
    total_tokens?: number | string;
  };
  error?: { message?: string; type?: string; code?: string };
};

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  return v.length === 0 || v === "change_me";
}

function parseTokenCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return null;
}

/** Маппинг OpenAI-compatible usage → AiTokenUsage. */
export function parseQwenOpenAiUsage(usage: unknown): AiTokenUsage | null {
  if (typeof usage !== "object" || usage === null || Array.isArray(usage)) {
    return null;
  }

  const u = usage as Record<string, unknown>;
  const inputTextTokens = parseTokenCount(u.prompt_tokens);
  const completionTokens = parseTokenCount(u.completion_tokens);
  const totalFromApi = parseTokenCount(u.total_tokens);

  if (
    inputTextTokens === null &&
    completionTokens === null &&
    totalFromApi === null
  ) {
    return null;
  }

  const input = inputTextTokens ?? 0;
  const output = completionTokens ?? 0;
  const total = totalFromApi ?? input + output;

  return {
    inputTextTokens: input,
    completionTokens: output,
    totalTokens: total,
  };
}

function resolveQwenAuthType(): QwenAuthType {
  const raw = (process.env.QWEN_AUTH_TYPE?.trim() || DEFAULT_QWEN_AUTH_TYPE).toLowerCase();
  if (raw === "iam-token" || raw === "iam") return "iam-token";
  if (raw !== "api-key" && process.env.BOT_DEV_LOG !== "0") {
    console.warn(`[yandex-gpt] unknown QWEN_AUTH_TYPE="${raw}", using api-key`);
  }
  return "api-key";
}

function resolveQwenBaseUrl(): string {
  const raw = process.env.QWEN_BASE_URL?.trim();
  return isPlaceholder(raw) ? DEFAULT_QWEN_BASE_URL : raw!;
}

function resolveQwenModel(): string {
  return process.env.QWEN_MODEL?.trim() ?? "";
}

/** folder_id из gpt://<folder>/... или YANDEX_CLOUD_FOLDER_ID. */
export function resolveQwenFolderId(model: string): string | undefined {
  const fromUri = model.match(/^gpt:\/\/([^/]+)\//i)?.[1]?.trim();
  if (fromUri && !isPlaceholder(fromUri)) return fromUri;

  const fromEnv = process.env.YANDEX_CLOUD_FOLDER_ID?.trim();
  if (!isPlaceholder(fromEnv)) return fromEnv;
  return undefined;
}

function resolveQwenCredential(authType: QwenAuthType): string | null {
  const qwenKey = process.env.QWEN_API_KEY?.trim();

  if (authType === "iam-token") {
    if (!isPlaceholder(qwenKey)) return qwenKey!;
    const iam = process.env.YANDEX_CLOUD_IAM_TOKEN?.trim();
    if (!isPlaceholder(iam)) return iam!;
    return null;
  }

  if (!isPlaceholder(qwenKey)) return qwenKey!;
  return null;
}

function buildAuthorizationHeader(config: QwenConfig): string {
  if (config.authType === "api-key") {
    return `Api-Key ${config.credential}`;
  }
  return `Bearer ${config.credential}`;
}

function buildQwenRequestHeaders(config: QwenConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: buildAuthorizationHeader(config),
  };
  if (config.folderId) {
    headers["x-folder-id"] = config.folderId;
  }
  return headers;
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

export function getQwenState(): QwenState {
  const baseUrl = resolveQwenBaseUrl();
  const model = resolveQwenModel();
  const authType = resolveQwenAuthType();
  const credential = resolveQwenCredential(authType);
  const hasApiKey = credential !== null;
  const modelOk = !isPlaceholder(model);

  if (!hasApiKey || !modelOk) {
    const apiKeyRaw = process.env.QWEN_API_KEY?.trim();
    return {
      enabled: false,
      reason:
        isPlaceholder(apiKeyRaw) && apiKeyRaw === "change_me"
          ? "placeholder_env"
          : "missing_env",
      baseUrl,
      model: modelOk ? model : "(not set)",
      authType,
      hasApiKey,
    };
  }

  const folderId = resolveQwenFolderId(model);

  if (process.env.BOT_DEV_LOG !== "0") {
    console.log(
      `[yandex-gpt] qwen baseUrl=${baseUrl} authType=${authType} model=${model}${folderId ? ` folderId=${folderId}` : ""}`,
    );
  }

  return {
    enabled: true,
    config: {
      credential: credential!,
      authType,
      baseUrl: baseUrl.replace(/\/$/, ""),
      model,
      folderId,
    },
  };
}

export function getQwenAiProviderState(): AiProviderState {
  const state = getQwenState();
  const base = buildProviderDiagnosticsBase("qwen");
  if (!state.enabled) {
    const missingEnv: string[] = [];
    if (!state.hasApiKey) missingEnv.push("QWEN_API_KEY");
    if (state.model === "(not set)" || !state.model.trim()) missingEnv.push("QWEN_MODEL");
    return {
      enabled: false,
      providerId: "qwen",
      reason: state.reason,
      diagnostics: {
        ...base,
        configured: false,
        baseUrl: state.baseUrl,
        authType: state.authType,
        model: state.model,
        reason: state.reason,
        missingEnv,
      },
    };
  }
  const endpoint = buildChatCompletionsUrl(state.config.baseUrl);
  return {
    enabled: true,
    providerId: "qwen",
    model: state.config.model,
    diagnostics: {
      ...base,
      configured: true,
      model: state.config.model,
      baseUrl: state.config.baseUrl,
      endpoint,
      authType: state.config.authType,
    },
  };
}

/** Для dev-checks: state без секретов. */
export function qwenStateForDiagnostics(state: QwenState): Record<string, unknown> {
  const http = getProviderHttpSettings();
  if (state.enabled) {
    return {
      provider: "qwen",
      configured: true,
      hasApiKey: true,
      baseUrl: state.config.baseUrl,
      endpoint: buildChatCompletionsUrl(state.config.baseUrl),
      authType: state.config.authType,
      model: state.config.model,
      folderId: state.config.folderId ?? null,
      timeoutMs: http.timeoutMs,
      maxRetries: http.maxRetries,
      retryBaseDelayMs: http.retryBaseDelayMs,
    };
  }
  return {
    provider: "qwen",
    configured: false,
    hasApiKey: state.hasApiKey,
    baseUrl: state.baseUrl,
    authType: state.authType,
    model: state.model,
    reason: state.reason,
    timeoutMs: http.timeoutMs,
    maxRetries: http.maxRetries,
    retryBaseDelayMs: http.retryBaseDelayMs,
  };
}

/** Парсит OpenAI-compatible chat completion без HTTP. */
export function mapQwenChatCompletionResponse(
  data: QwenChatCompletionResponse,
  fallbackModel: string,
): AiCompletionResult {
  const text = data.choices?.[0]?.message?.content;
  if (!text?.trim()) {
    throw new AiProviderError({
      provider: "qwen",
      code: "AI_PROVIDER_EMPTY_RESPONSE",
      retryable: false,
      message: "provider=qwen code=AI_PROVIDER_EMPTY_RESPONSE",
    });
  }

  return {
    text,
    usage: parseQwenOpenAiUsage(data.usage),
    raw: data,
    model: data.model?.trim() || fallbackModel,
    provider: "qwen",
  };
}

function parseQwenCompletionBody(bodyText: string, config: QwenConfig): AiCompletionResult {
  let data: QwenChatCompletionResponse;
  try {
    data = JSON.parse(bodyText) as QwenChatCompletionResponse;
  } catch {
    throw new AiProviderError({
      provider: "qwen",
      code: "AI_PROVIDER_RESPONSE_PARSE_ERROR",
      retryable: false,
      message: "provider=qwen code=AI_PROVIDER_RESPONSE_PARSE_ERROR",
    });
  }

  if (!data.choices?.length) {
    const errMsg = data.error?.message;
    throw new AiProviderError({
      provider: "qwen",
      code: "AI_PROVIDER_EMPTY_RESPONSE",
      retryable: false,
      message: errMsg
        ? `provider=qwen code=AI_PROVIDER_EMPTY_RESPONSE`
        : "provider=qwen code=AI_PROVIDER_EMPTY_RESPONSE",
      details: errMsg ? { apiMessage: errMsg.slice(0, 200) } : undefined,
    });
  }

  return mapQwenChatCompletionResponse(data, config.model);
}

async function callQwenCompletion(
  config: QwenConfig,
  params: AiCompletionParams,
): Promise<AiCompletionResult> {
  const startedAt = Date.now();
  const url = buildChatCompletionsUrl(config.baseUrl);
  const { bodyText } = await requestProviderHttp({
    provider: "qwen",
    url,
    headers: buildQwenRequestHeaders(config),
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      temperature: params.temperature ?? 0.2,
      max_tokens: params.maxTokens ?? 2000,
    }),
    promptGroup: params.promptGroup,
  });

  const result = parseQwenCompletionBody(bodyText, config);
  return { ...result, latencyMs: Date.now() - startedAt };
}

/** HTTP-адаптер Qwen через Yandex Cloud AI Studio (OpenAI-compatible). */
export function createQwenProvider(): AiProvider {
  const state = getQwenState();
  const config = state.enabled ? state.config : null;

  return {
    id: "qwen",
    async complete(params: AiCompletionParams): Promise<AiCompletionResult> {
      if (!config) {
        throw new AiProviderError({
          provider: "qwen",
          code: "AI_PROVIDER_NOT_CONFIGURED",
          retryable: false,
          message:
            "provider=qwen code=AI_PROVIDER_NOT_CONFIGURED (missing QWEN_API_KEY or QWEN_MODEL)",
        });
      }
      return callQwenCompletion(config, params);
    },
  };
}
