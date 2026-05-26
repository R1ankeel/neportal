import type { SpeechKitAuthType, SpeechKitState } from "./types";

const DEFAULT_ENDPOINT = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize";
const DEFAULT_LANGUAGE = "ru-RU";
const DEFAULT_FORMAT = "oggopus";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_DURATION_SEC = 30;
const DEFAULT_MAX_FILE_SIZE_MB = 1;

export type SpeechKitConfig = {
  enabled: boolean;
  apiKey?: string;
  folderId?: string;
  authType: SpeechKitAuthType;
  language: string;
  format: string;
  timeoutMs: number;
  maxDurationSec: number;
  maxFileSizeMb: number;
  endpoint: string;
};

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isUnset(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed === "change_me";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseAuthType(value: string | undefined): SpeechKitAuthType {
  if (!value?.trim()) return "api-key";
  return value.trim().toLowerCase() === "api-key" ? "api-key" : "api-key";
}

function pickSpeechKitApiKey(): string | undefined {
  const primary = process.env.YANDEX_SPEECHKIT_API_KEY;
  if (!isUnset(primary)) return primary?.trim();
  const fallback = process.env.SPEECHKIT_API_KEY;
  if (!isUnset(fallback)) return fallback?.trim();
  return undefined;
}

function pickSpeechKitFolderId(): string | undefined {
  const primary = process.env.YANDEX_SPEECHKIT_FOLDER_ID;
  if (!isUnset(primary)) return primary?.trim();
  const fallback = process.env.SPEECHKIT_FOLDER_ID;
  if (!isUnset(fallback)) return fallback?.trim();
  return undefined;
}

export function getSpeechKitConfig(): SpeechKitConfig {
  return {
    enabled: isTruthy(process.env.YANDEX_SPEECHKIT_ENABLED),
    apiKey: pickSpeechKitApiKey(),
    folderId: pickSpeechKitFolderId(),
    authType: parseAuthType(process.env.YANDEX_SPEECHKIT_AUTH_TYPE),
    language: process.env.YANDEX_SPEECHKIT_LANGUAGE?.trim() || DEFAULT_LANGUAGE,
    format: process.env.YANDEX_SPEECHKIT_FORMAT?.trim() || DEFAULT_FORMAT,
    timeoutMs: parsePositiveInt(process.env.YANDEX_SPEECHKIT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxDurationSec: parsePositiveInt(
      process.env.YANDEX_SPEECHKIT_MAX_DURATION_SEC,
      DEFAULT_MAX_DURATION_SEC,
    ),
    maxFileSizeMb: parsePositiveInt(
      process.env.YANDEX_SPEECHKIT_MAX_FILE_SIZE_MB,
      DEFAULT_MAX_FILE_SIZE_MB,
    ),
    endpoint: process.env.YANDEX_SPEECHKIT_ENDPOINT?.trim() || DEFAULT_ENDPOINT,
  };
}

export function getSpeechKitState(): SpeechKitState {
  const cfg = getSpeechKitConfig();
  const hasApiKey = !!cfg.apiKey;
  const hasFolderId = !!cfg.folderId;
  const configured = cfg.enabled && hasApiKey && hasFolderId;

  const missingEnv: string[] = [];
  if (!hasApiKey) missingEnv.push("YANDEX_SPEECHKIT_API_KEY");
  if (!hasFolderId) missingEnv.push("YANDEX_SPEECHKIT_FOLDER_ID");

  return {
    provider: "yandex-speechkit",
    enabled: cfg.enabled,
    configured,
    hasApiKey,
    hasFolderId,
    authType: cfg.authType,
    language: cfg.language,
    format: cfg.format,
    timeoutMs: cfg.timeoutMs,
    maxDurationSec: cfg.maxDurationSec,
    maxFileSizeMb: cfg.maxFileSizeMb,
    endpoint: cfg.endpoint,
    missingEnv: missingEnv.length > 0 ? missingEnv : undefined,
    reason: !cfg.enabled ? "disabled_by_env" : configured ? undefined : "missing_credentials",
  };
}
