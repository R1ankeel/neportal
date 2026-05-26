export type SpeechKitAuthType = "api-key";

export type SpeechRecognitionInput = {
  audioBuffer: Buffer;
  format?: string;
  language?: string;
  folderId?: string;
};

export type SpeechRecognitionResult = {
  text: string;
  provider: "yandex-speechkit";
  model?: string;
  durationMs: number;
  raw?: unknown;
};

export type SpeechKitState = {
  provider: "yandex-speechkit";
  enabled: boolean;
  configured: boolean;
  hasApiKey: boolean;
  hasFolderId: boolean;
  authType: "api-key";
  language: string;
  format: string;
  timeoutMs: number;
  maxDurationSec: number;
  maxFileSizeMb: number;
  endpoint: string;
  missingEnv?: string[];
  reason?: string;
};

export type SpeechKitErrorCode =
  | "SPEECHKIT_NOT_ENABLED"
  | "SPEECHKIT_NOT_CONFIGURED"
  | "SPEECHKIT_TIMEOUT"
  | "SPEECHKIT_HTTP_ERROR"
  | "SPEECHKIT_NETWORK_ERROR"
  | "SPEECHKIT_EMPTY_RESULT"
  | "SPEECHKIT_RESPONSE_PARSE_ERROR"
  | "SPEECHKIT_FILE_TOO_LARGE"
  | "SPEECHKIT_UNKNOWN_ERROR";

export type SpeechKitErrorOptions = {
  code: SpeechKitErrorCode;
  message?: string;
  status?: number;
  retryable?: boolean;
  timeoutMs?: number;
  requestId?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class SpeechKitError extends Error {
  readonly provider = "yandex-speechkit";
  readonly code: SpeechKitErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly timeoutMs?: number;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(opts: SpeechKitErrorOptions) {
    super(
      opts.message ??
        `provider=yandex-speechkit code=${opts.code}${opts.status != null ? ` status=${opts.status}` : ""}${opts.timeoutMs != null ? ` timeoutMs=${opts.timeoutMs}` : ""}`,
    );
    this.name = "SpeechKitError";
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
}

