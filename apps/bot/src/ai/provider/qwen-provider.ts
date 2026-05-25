import type { AiCompletionParams, AiCompletionResult, AiProvider, AiProviderState, AiTokenUsage } from "./types";

const DEFAULT_QWEN_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DEFAULT_QWEN_MODEL = "qwen-plus";

export type QwenConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type QwenDisabledReason = "missing_env" | "placeholder_env";

export type QwenState =
  | { enabled: true; config: QwenConfig }
  | {
      enabled: false;
      reason: QwenDisabledReason;
      baseUrl: string;
      model: string;
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

function resolveQwenBaseUrl(): string {
  const raw = process.env.QWEN_BASE_URL?.trim();
  return isPlaceholder(raw) ? DEFAULT_QWEN_BASE_URL : raw!;
}

function resolveQwenModel(): string {
  const raw = process.env.QWEN_MODEL?.trim();
  return isPlaceholder(raw) ? DEFAULT_QWEN_MODEL : raw!;
}

export function getQwenState(): QwenState {
  const baseUrl = resolveQwenBaseUrl();
  const model = resolveQwenModel();
  const apiKeyRaw = process.env.QWEN_API_KEY?.trim();
  const hasApiKey = !isPlaceholder(apiKeyRaw);

  if (!hasApiKey) {
    return {
      enabled: false,
      reason: isPlaceholder(apiKeyRaw) && apiKeyRaw === "change_me"
        ? "placeholder_env"
        : "missing_env",
      baseUrl,
      model,
      hasApiKey: false,
    };
  }

  if (process.env.BOT_DEV_LOG !== "0") {
    console.log(`[yandex-gpt] qwen baseUrl=${baseUrl} model=${model}`);
  }

  return {
    enabled: true,
    config: {
      apiKey: apiKeyRaw!,
      baseUrl: baseUrl.replace(/\/$/, ""),
      model,
    },
  };
}

export function getQwenAiProviderState(): AiProviderState {
  const state = getQwenState();
  if (!state.enabled) {
    return { enabled: false, providerId: "qwen", reason: state.reason };
  }
  return {
    enabled: true,
    providerId: "qwen",
    model: state.config.model,
  };
}

/** Для dev-checks: state без секретов. */
export function qwenStateForDiagnostics(state: QwenState): Record<string, unknown> {
  if (state.enabled) {
    return {
      provider: "qwen",
      configured: true,
      hasApiKey: true,
      baseUrl: state.config.baseUrl,
      model: state.config.model,
    };
  }
  return {
    provider: "qwen",
    configured: false,
    hasApiKey: state.hasApiKey,
    baseUrl: state.baseUrl,
    model: state.model,
    reason: state.reason,
  };
}

function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function extractRequestId(headers: Headers, body: unknown): string | undefined {
  const fromHeader =
    headers.get("x-request-id") ??
    headers.get("x-dashscope-requestid") ??
    headers.get("x-fc-request-id");
  if (fromHeader?.trim()) return fromHeader.trim();

  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const b = body as Record<string, unknown>;
    const id = b.request_id ?? b.requestId;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return undefined;
}

function formatQwenHttpError(
  status: number,
  bodyText: string,
  headers: Headers,
): Error {
  let detail = bodyText.slice(0, 500);
  let requestId: string | undefined;
  try {
    const parsed = JSON.parse(bodyText) as QwenChatCompletionResponse & {
      request_id?: string;
    };
    requestId = extractRequestId(headers, parsed);
    const msg = parsed.error?.message;
    if (typeof msg === "string" && msg.trim()) {
      detail = msg.trim().slice(0, 500);
    }
  } catch {
    requestId = extractRequestId(headers, undefined);
  }

  const reqPart = requestId ? ` requestId=${requestId}` : "";
  return new Error(`provider=qwen HTTP ${status}${reqPart}: ${detail}`);
}

/** Парсит OpenAI-compatible chat completion без HTTP. */
export function mapQwenChatCompletionResponse(
  data: QwenChatCompletionResponse,
  fallbackModel: string,
): AiCompletionResult {
  const text = data.choices?.[0]?.message?.content;
  if (!text?.trim()) {
    throw new Error("provider=qwen returned empty completion (no choices[0].message.content)");
  }

  return {
    text,
    usage: parseQwenOpenAiUsage(data.usage),
    raw: data,
    model: data.model?.trim() || fallbackModel,
    provider: "qwen",
  };
}

async function callQwenCompletion(
  config: QwenConfig,
  params: AiCompletionParams,
): Promise<AiCompletionResult> {
  const startedAt = Date.now();
  const url = buildChatCompletionsUrl(config.baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      temperature: params.temperature ?? 0.2,
      max_tokens: params.maxTokens ?? 2000,
    }),
  });

  const bodyText = await res.text().catch(() => "");

  if (!res.ok) {
    throw formatQwenHttpError(res.status, bodyText, res.headers);
  }

  let data: QwenChatCompletionResponse;
  try {
    data = JSON.parse(bodyText) as QwenChatCompletionResponse;
  } catch {
    throw new Error(
      `provider=qwen invalid JSON response: ${bodyText.slice(0, 200)}`,
    );
  }

  if (!data.choices?.length) {
    const errMsg = data.error?.message;
    throw new Error(
      errMsg
        ? `provider=qwen API error: ${errMsg.slice(0, 500)}`
        : "provider=qwen response missing choices",
    );
  }

  const result = mapQwenChatCompletionResponse(data, config.model);
  return { ...result, latencyMs: Date.now() - startedAt };
}

/** HTTP-адаптер Qwen OpenAI-compatible API (DashScope). */
export function createQwenProvider(): AiProvider {
  const state = getQwenState();
  const config = state.enabled ? state.config : null;

  return {
    id: "qwen",
    async complete(params: AiCompletionParams): Promise<AiCompletionResult> {
      if (!config) {
        throw new Error(
          "Qwen is not configured (missing QWEN_API_KEY). Set QWEN_API_KEY or use AI_PROVIDER=yandex.",
        );
      }
      return callQwenCompletion(config, params);
    },
  };
}
