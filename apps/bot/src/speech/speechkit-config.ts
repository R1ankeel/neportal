import type { SpeechKitAuthType, SpeechKitState } from "./types";

const DEFAULT_ENDPOINT = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize";
const DEFAULT_ASYNC_ENDPOINT = "https://transcribe.api.cloud.yandex.net/speech/stt/v2/longRunningRecognize";
const DEFAULT_ASYNC_OPERATIONS_ENDPOINT = "https://operation.api.cloud.yandex.net/operations";
const DEFAULT_LANGUAGE = "ru-RU";
const DEFAULT_FORMAT = "oggopus";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_DURATION_SEC = 30;
const DEFAULT_MAX_FILE_SIZE_MB = 1;
const DEFAULT_ASYNC_MODEL = "general";
const DEFAULT_ASYNC_POLL_INTERVAL_MS = 2_000;
const DEFAULT_ASYNC_TIMEOUT_MS = 120_000;
const DEFAULT_ASYNC_MAX_DURATION_SEC = 600;
const DEFAULT_ASYNC_MAX_FILE_SIZE_MB = 100;
const DEFAULT_ASYNC_DELETE_OBJECT = true;
const DEFAULT_STORAGE_ENDPOINT = "https://storage.yandexcloud.net";
const DEFAULT_STORAGE_REGION = "ru-central1";
const DEFAULT_STORAGE_PREFIX = "speechkit/tmp/";

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
  asyncEnabled: boolean;
  asyncModel: string;
  asyncPollIntervalMs: number;
  asyncTimeoutMs: number;
  asyncMaxDurationSec: number;
  asyncMaxFileSizeMb: number;
  asyncDeleteObject: boolean;
  asyncEndpoint: string;
  asyncOperationsEndpoint: string;
  objectStorageBucket?: string;
  objectStoragePrefix: string;
  storageAccessKeyId?: string;
  storageSecretAccessKey?: string;
  storageEndpoint: string;
  storageRegion: string;
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

function pickOptionalEnv(key: string): string | undefined {
  const value = process.env[key];
  if (isUnset(value)) return undefined;
  return value?.trim();
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
    asyncEnabled: isTruthy(process.env.YANDEX_SPEECHKIT_ASYNC_ENABLED),
    asyncModel: process.env.YANDEX_SPEECHKIT_ASYNC_MODEL?.trim() || DEFAULT_ASYNC_MODEL,
    asyncPollIntervalMs: parsePositiveInt(
      process.env.YANDEX_SPEECHKIT_ASYNC_POLL_INTERVAL_MS,
      DEFAULT_ASYNC_POLL_INTERVAL_MS,
    ),
    asyncTimeoutMs: parsePositiveInt(
      process.env.YANDEX_SPEECHKIT_ASYNC_TIMEOUT_MS,
      DEFAULT_ASYNC_TIMEOUT_MS,
    ),
    asyncMaxDurationSec: parsePositiveInt(
      process.env.YANDEX_SPEECHKIT_ASYNC_MAX_DURATION_SEC,
      DEFAULT_ASYNC_MAX_DURATION_SEC,
    ),
    asyncMaxFileSizeMb: parsePositiveInt(
      process.env.YANDEX_SPEECHKIT_ASYNC_MAX_FILE_SIZE_MB,
      DEFAULT_ASYNC_MAX_FILE_SIZE_MB,
    ),
    asyncDeleteObject:
      process.env.YANDEX_SPEECHKIT_ASYNC_DELETE_OBJECT == null
        ? DEFAULT_ASYNC_DELETE_OBJECT
        : isTruthy(process.env.YANDEX_SPEECHKIT_ASYNC_DELETE_OBJECT),
    asyncEndpoint:
      process.env.YANDEX_SPEECHKIT_ASYNC_ENDPOINT?.trim() || DEFAULT_ASYNC_ENDPOINT,
    asyncOperationsEndpoint:
      process.env.YANDEX_SPEECHKIT_ASYNC_OPERATIONS_ENDPOINT?.trim()
      || DEFAULT_ASYNC_OPERATIONS_ENDPOINT,
    objectStorageBucket: pickOptionalEnv("YANDEX_SPEECHKIT_OBJECT_STORAGE_BUCKET"),
    objectStoragePrefix:
      process.env.YANDEX_SPEECHKIT_OBJECT_STORAGE_PREFIX?.trim() || DEFAULT_STORAGE_PREFIX,
    storageAccessKeyId: pickOptionalEnv("YANDEX_STORAGE_ACCESS_KEY_ID"),
    storageSecretAccessKey: pickOptionalEnv("YANDEX_STORAGE_SECRET_ACCESS_KEY"),
    storageEndpoint: process.env.YANDEX_STORAGE_ENDPOINT?.trim() || DEFAULT_STORAGE_ENDPOINT,
    storageRegion: process.env.YANDEX_STORAGE_REGION?.trim() || DEFAULT_STORAGE_REGION,
  };
}

export function getSpeechKitState(): SpeechKitState {
  const cfg = getSpeechKitConfig();
  const hasApiKey = !!cfg.apiKey;
  const hasFolderId = !!cfg.folderId;
  const configured = cfg.enabled && hasApiKey && hasFolderId;

  const hasStorageAccessKey = !!cfg.storageAccessKeyId;
  const hasStorageSecretKey = !!cfg.storageSecretAccessKey;
  const objectStorageConfigured =
    !!cfg.objectStorageBucket
    && hasStorageAccessKey
    && hasStorageSecretKey
    && !!cfg.storageEndpoint
    && !!cfg.storageRegion;
  const asyncConfigured = cfg.asyncEnabled && configured && objectStorageConfigured;

  const missingEnv: string[] = [];
  if (!hasApiKey) missingEnv.push("YANDEX_SPEECHKIT_API_KEY");
  if (!hasFolderId) missingEnv.push("YANDEX_SPEECHKIT_FOLDER_ID");
  if (cfg.asyncEnabled) {
    if (!cfg.objectStorageBucket) missingEnv.push("YANDEX_SPEECHKIT_OBJECT_STORAGE_BUCKET");
    if (!hasStorageAccessKey) missingEnv.push("YANDEX_STORAGE_ACCESS_KEY_ID");
    if (!hasStorageSecretKey) missingEnv.push("YANDEX_STORAGE_SECRET_ACCESS_KEY");
    if (!cfg.storageEndpoint) missingEnv.push("YANDEX_STORAGE_ENDPOINT");
    if (!cfg.storageRegion) missingEnv.push("YANDEX_STORAGE_REGION");
  }

  return {
    provider: "yandex-speechkit",
    enabled: cfg.enabled,
    configured,
    asyncEnabled: cfg.asyncEnabled,
    asyncConfigured,
    objectStorageConfigured,
    asyncModel: cfg.asyncModel,
    asyncPollIntervalMs: cfg.asyncPollIntervalMs,
    asyncTimeoutMs: cfg.asyncTimeoutMs,
    asyncMaxDurationSec: cfg.asyncMaxDurationSec,
    asyncMaxFileSizeMb: cfg.asyncMaxFileSizeMb,
    asyncDeleteObject: cfg.asyncDeleteObject,
    objectStorageBucket: cfg.objectStorageBucket,
    objectStoragePrefix: cfg.objectStoragePrefix,
    storageEndpoint: cfg.storageEndpoint,
    storageRegion: cfg.storageRegion,
    hasStorageAccessKey,
    hasStorageSecretKey,
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
    reason: !cfg.enabled
      ? "disabled_by_env"
      : configured
        ? undefined
        : "missing_credentials",
  };
}
