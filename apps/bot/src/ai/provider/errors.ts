import type { AiProviderId } from "./types";

export type AiProviderErrorCode =
  | "AI_PROVIDER_NOT_CONFIGURED"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_PROVIDER_NETWORK_ERROR"
  | "AI_PROVIDER_HTTP_ERROR"
  | "AI_PROVIDER_EMPTY_RESPONSE"
  | "AI_PROVIDER_RESPONSE_PARSE_ERROR"
  | "AI_PROVIDER_UNKNOWN_ERROR";

const SECRET_PATTERNS = [
  /\bapi[_-]?key\s*[:=]\s*\S+/gi,
  /\bauthorization\s*:\s*[^\n]+/gi,
  /\bbearer\s+[^\s]+/gi,
  /\bapi-key\s+[^\s]+/gi,
  /\biam[_-]?token\s*[:=]\s*\S+/gi,
  /y0__[a-z0-9]+/gi,
];

export function sanitizeProviderErrorText(text: string): string {
  let s = text.slice(0, 500);
  for (const re of SECRET_PATTERNS) {
    s = s.replace(re, "[redacted]");
  }
  return s;
}

export type AiProviderErrorOptions = {
  provider: AiProviderId | string;
  code: AiProviderErrorCode;
  message?: string;
  status?: number;
  retryable?: boolean;
  timeoutMs?: number;
  requestId?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
};

export class AiProviderError extends Error {
  readonly provider: string;
  readonly code: AiProviderErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly timeoutMs?: number;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(opts: AiProviderErrorOptions) {
    const message =
      opts.message ??
      `provider=${opts.provider} code=${opts.code}${opts.status != null ? ` status=${opts.status}` : ""}${opts.timeoutMs != null ? ` timeoutMs=${opts.timeoutMs}` : ""}`;
    super(message);
    this.name = "AiProviderError";
    this.provider = opts.provider;
    this.code = opts.code;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    this.timeoutMs = opts.timeoutMs;
    this.requestId = opts.requestId;
    this.details = opts.details;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }

  /** Безопасные поля для console.log. */
  toLogRecord(extra?: Record<string, unknown>): Record<string, unknown> {
    const safeDetails: Record<string, unknown> = {};
    if (this.details) {
      for (const [k, v] of Object.entries(this.details)) {
        safeDetails[k] =
          typeof v === "string" ? sanitizeProviderErrorText(v) : v;
      }
    }
    return {
      provider: this.provider,
      code: this.code,
      status: this.status,
      retryable: this.retryable,
      timeoutMs: this.timeoutMs,
      requestId: this.requestId,
      ...safeDetails,
      ...extra,
    };
  }
}

export function isAiProviderError(err: unknown): err is AiProviderError {
  return err instanceof AiProviderError;
}
