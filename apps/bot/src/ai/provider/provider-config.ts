import type { AiProviderDisabledReason, AiProviderId } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export type ProviderHttpSettings = {
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
};

/** Настройки timeout/retry для всех AI providers (из env). */
export function getProviderHttpSettings(): ProviderHttpSettings {
  return {
    timeoutMs: parsePositiveInt(process.env.AI_PROVIDER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxRetries: parsePositiveInt(process.env.AI_PROVIDER_MAX_RETRIES, DEFAULT_MAX_RETRIES),
    retryBaseDelayMs: parsePositiveInt(
      process.env.AI_PROVIDER_RETRY_BASE_DELAY_MS,
      DEFAULT_RETRY_BASE_DELAY_MS,
    ),
  };
}

export type AiProviderDiagnosticsFields = {
  provider: AiProviderId;
  configured: boolean;
  model?: string;
  endpoint?: string;
  baseUrl?: string;
  authType?: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  reason?: AiProviderDisabledReason;
  missingEnv?: string[];
};

export function buildProviderDiagnosticsBase(
  provider: AiProviderId,
  extra?: Partial<AiProviderDiagnosticsFields>,
): AiProviderDiagnosticsFields {
  const http = getProviderHttpSettings();
  return {
    provider,
    configured: false,
    timeoutMs: http.timeoutMs,
    maxRetries: http.maxRetries,
    retryBaseDelayMs: http.retryBaseDelayMs,
    ...extra,
  };
}
