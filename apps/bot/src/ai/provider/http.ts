import { AiProviderError, sanitizeProviderErrorText } from "./errors";
import { getProviderHttpSettings } from "./provider-config";
import type { AiProviderId } from "./types";

const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUSES.has(status);
}

export function isRetryableProviderError(err: unknown): boolean {
  if (err instanceof AiProviderError) return err.retryable;
  return false;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeRetryDelayMs(attempt: number, baseDelayMs: number): number {
  if (attempt <= 0) return 0;
  return baseDelayMs * 2 ** (attempt - 1);
}

export function extractRequestId(headers: Headers, body?: unknown): string | undefined {
  const fromHeader =
    headers.get("x-request-id") ??
    headers.get("x-requestid") ??
    headers.get("x-yandex-request-id") ??
    headers.get("request-id") ??
    headers.get("x-amzn-requestid") ??
    headers.get("x-dashscope-requestid");
  if (fromHeader?.trim()) return fromHeader.trim();

  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const b = body as Record<string, unknown>;
    for (const key of ["request_id", "requestId", "id"]) {
      const id = b[key];
      if (typeof id === "string" && id.trim() && id.length <= 128) return id.trim();
    }
  }
  return undefined;
}

function tryParseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.message.toLowerCase().includes("aborted"))
  );
}

function isNetworkFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (isAbortError(err)) return false;
  return (
    err.name === "TypeError" ||
    err.message.includes("fetch failed") ||
    err.message.includes("ECONNREFUSED") ||
    err.message.includes("ENOTFOUND") ||
    err.message.includes("network")
  );
}

export function wrapFetchError(
  err: unknown,
  provider: AiProviderId,
  timeoutMs: number,
  promptGroup?: string,
): AiProviderError {
  if (err instanceof AiProviderError) return err;

  if (isAbortError(err)) {
    return new AiProviderError({
      provider,
      code: "AI_PROVIDER_TIMEOUT",
      retryable: true,
      timeoutMs,
      message: `provider=${provider} code=AI_PROVIDER_TIMEOUT timeoutMs=${timeoutMs}`,
      cause: err,
      details: promptGroup ? { promptGroup } : undefined,
    });
  }

  if (isNetworkFetchError(err)) {
    return new AiProviderError({
      provider,
      code: "AI_PROVIDER_NETWORK_ERROR",
      retryable: true,
      message: `provider=${provider} code=AI_PROVIDER_NETWORK_ERROR`,
      cause: err,
      details: promptGroup ? { promptGroup } : undefined,
    });
  }

  return new AiProviderError({
    provider,
    code: "AI_PROVIDER_UNKNOWN_ERROR",
    retryable: false,
    message: `provider=${provider} code=AI_PROVIDER_UNKNOWN_ERROR`,
    cause: err,
    details: promptGroup ? { promptGroup } : undefined,
  });
}

export type ProviderHttpRequest = {
  provider: AiProviderId;
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: string;
  promptGroup?: string;
};

export type ProviderHttpResponse = {
  bodyText: string;
  headers: Headers;
  attempts: number;
};

/**
 * fetch с timeout (AbortController) и retry только для transient ошибок.
 * Успешный ответ возвращается один раз; token usage логируется снаружи.
 */
export async function requestProviderHttp(
  req: ProviderHttpRequest,
): Promise<ProviderHttpResponse> {
  const settings = getProviderHttpSettings();
  const method = req.method ?? "POST";
  let lastError: AiProviderError | undefined;

  for (let attempt = 0; attempt <= settings.maxRetries; attempt++) {
    const delayMs = computeRetryDelayMs(attempt, settings.retryBaseDelayMs);
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);

    try {
      const res = await fetch(req.url, {
        method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
      });

      const bodyText = await res.text().catch(() => "");

      if (!res.ok) {
        const parsed = tryParseJsonSafe(bodyText);
        const requestId = extractRequestId(res.headers, parsed);
        const detail = sanitizeProviderErrorText(
          typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            typeof (parsed as { error?: { message?: string } }).error?.message === "string"
            ? (parsed as { error: { message: string } }).error.message
            : bodyText,
        );
        const err = new AiProviderError({
          provider: req.provider,
          code: "AI_PROVIDER_HTTP_ERROR",
          status: res.status,
          retryable: isRetryableHttpStatus(res.status),
          requestId,
          message: `provider=${req.provider} code=AI_PROVIDER_HTTP_ERROR status=${res.status}`,
          details: {
            promptGroup: req.promptGroup,
            attempts: attempt + 1,
            detail,
          },
        });
        if (err.retryable && attempt < settings.maxRetries) {
          lastError = err;
          logProviderRetryAttempt(err, attempt + 1, settings.maxRetries + 1);
          continue;
        }
        logProviderHttpFailure(err, attempt + 1);
        throw err;
      }

      return { bodyText, headers: res.headers, attempts: attempt + 1 };
    } catch (e) {
      const wrapped = wrapFetchError(e, req.provider, settings.timeoutMs, req.promptGroup);
      const err = new AiProviderError({
        provider: wrapped.provider,
        code: wrapped.code,
        status: wrapped.status,
        retryable: wrapped.retryable,
        timeoutMs: wrapped.timeoutMs,
        requestId: wrapped.requestId,
        message: wrapped.message,
        cause: wrapped.cause,
        details: { ...wrapped.details, attempts: attempt + 1 },
      });
      if (err.retryable && attempt < settings.maxRetries) {
        lastError = err;
        logProviderRetryAttempt(err, attempt + 1, settings.maxRetries + 1);
        continue;
      }
      logProviderHttpFailure(err, attempt + 1);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError) {
    logProviderHttpFailure(lastError, settings.maxRetries + 1);
    throw lastError;
  }

  throw new AiProviderError({
    provider: req.provider,
    code: "AI_PROVIDER_UNKNOWN_ERROR",
    message: `provider=${req.provider} code=AI_PROVIDER_UNKNOWN_ERROR`,
  });
}

function logProviderRetryAttempt(
  err: AiProviderError,
  attempt: number,
  maxAttempts: number,
): void {
  if (process.env.BOT_DEV_LOG === "0") return;
  console.warn(
    `[yandex-gpt] ai-provider retry attempt=${attempt}/${maxAttempts}`,
    err.toLogRecord(),
  );
}

export function logProviderHttpFailure(err: AiProviderError, attempts: number): void {
  if (process.env.BOT_DEV_LOG === "0") return;
  console.error(`[yandex-gpt] ai-provider request failed`, err.toLogRecord({ attempts }));
}

export function logAiProviderError(err: unknown, extra?: Record<string, unknown>): void {
  if (process.env.BOT_DEV_LOG === "0") return;
  if (err instanceof AiProviderError) {
    console.error(`[yandex-gpt] ai-provider error`, err.toLogRecord(extra));
    return;
  }
  console.error(`[yandex-gpt] ai-provider error`, { ...extra, message: String(err) });
}
