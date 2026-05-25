import { devLog } from "./dev-log";
import { AiProviderError, sanitizeProviderErrorText } from "./ai/provider/errors";
import {
  computeRetryDelayMs,
  isRetryableHttpStatus,
  isRetryableProviderError,
} from "./ai/provider/http";
import { getProviderHttpSettings } from "./ai/provider/provider-config";
import { mapQwenChatCompletionResponse } from "./ai/provider/qwen-provider";
import { getYandexGptState, yandexStateForDiagnostics } from "./ai/provider/yandex-provider";
import { getQwenState, qwenStateForDiagnostics } from "./ai/provider/qwen-provider";

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(keys: string[]): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const key of keys) {
    snap[key] = process.env[key];
  }
  return snap;
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snap)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const keys = [
    "AI_PROVIDER_TIMEOUT_MS",
    "AI_PROVIDER_MAX_RETRIES",
    "AI_PROVIDER_RETRY_BASE_DELAY_MS",
    "AI_PROVIDER",
    "QWEN_API_KEY",
    ...Object.keys(patch),
  ];
  const snap = snapshotEnv(keys);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    restoreEnv(snap);
  }
}

function devCheckHttpSettingsDefaults(): void {
  withEnv(
    {
      AI_PROVIDER_TIMEOUT_MS: undefined,
      AI_PROVIDER_MAX_RETRIES: undefined,
      AI_PROVIDER_RETRY_BASE_DELAY_MS: undefined,
    },
    () => {
      const s = getProviderHttpSettings();
      const ok =
        s.timeoutMs === 30_000 && s.maxRetries === 1 && s.retryBaseDelayMs === 500;
      devLog(`provider http settings defaults ${ok ? "OK" : "FAIL"}`, s);
    },
  );
}

function devCheckHttpSettingsFromEnv(): void {
  withEnv(
    {
      AI_PROVIDER_TIMEOUT_MS: "45000",
      AI_PROVIDER_MAX_RETRIES: "2",
      AI_PROVIDER_RETRY_BASE_DELAY_MS: "1000",
    },
    () => {
      const s = getProviderHttpSettings();
      const ok = s.timeoutMs === 45_000 && s.maxRetries === 2 && s.retryBaseDelayMs === 1000;
      devLog(`provider http settings from env ${ok ? "OK" : "FAIL"}`, s);
    },
  );
}

function devCheckRetryableStatuses(): void {
  const cases: Array<{ status: number; expected: boolean }> = [
    { status: 429, expected: true },
    { status: 500, expected: true },
    { status: 502, expected: true },
    { status: 503, expected: true },
    { status: 504, expected: true },
    { status: 408, expected: true },
    { status: 401, expected: false },
    { status: 403, expected: false },
    { status: 400, expected: false },
    { status: 404, expected: false },
  ];
  for (const { status, expected } of cases) {
    const got = isRetryableHttpStatus(status);
    devLog(`isRetryableHttpStatus ${status} ${got === expected ? "OK" : "FAIL"}`, {
      expected,
      got,
    });
  }
}

function devCheckRetryableProviderError(): void {
  const retryable = new AiProviderError({
    provider: "qwen",
    code: "AI_PROVIDER_HTTP_ERROR",
    status: 429,
    retryable: true,
  });
  const notRetryable = new AiProviderError({
    provider: "yandex",
    code: "AI_PROVIDER_HTTP_ERROR",
    status: 401,
    retryable: false,
  });
  devLog(`isRetryableProviderError 429 ${isRetryableProviderError(retryable) ? "OK" : "FAIL"}`);
  devLog(
    `isRetryableProviderError 401 ${!isRetryableProviderError(notRetryable) ? "OK" : "FAIL"}`,
  );
}

function devCheckRetryBackoff(): void {
  const ok =
    computeRetryDelayMs(0, 500) === 0 &&
    computeRetryDelayMs(1, 500) === 500 &&
    computeRetryDelayMs(2, 500) === 1000;
  devLog(`computeRetryDelayMs ${ok ? "OK" : "FAIL"}`, {
    a0: computeRetryDelayMs(0, 500),
    a1: computeRetryDelayMs(1, 500),
    a2: computeRetryDelayMs(2, 500),
  });
}

function devCheckEmptyQwenResponse(): void {
  let code = "";
  try {
    mapQwenChatCompletionResponse({ choices: [] }, "gpt://f/m/latest");
  } catch (e) {
    if (e instanceof AiProviderError) code = e.code;
  }
  const ok = code === "AI_PROVIDER_EMPTY_RESPONSE";
  devLog(`qwen empty choices ${ok ? "OK" : "FAIL"}`, { code });
}

function devCheckAiProviderErrorNoSecrets(): void {
  const err = new AiProviderError({
    provider: "qwen",
    code: "AI_PROVIDER_HTTP_ERROR",
    status: 401,
    message: `provider=qwen code=AI_PROVIDER_HTTP_ERROR status=401`,
    details: { detail: "Authorization: Bearer secret-token-xyz" },
  });
  const logJson = JSON.stringify(err.toLogRecord());
  const sanitized = sanitizeProviderErrorText("Api-Key y0__abcdefghijklmnop");
  const ok =
    !logJson.includes("secret-token") &&
    !logJson.includes("y0__") &&
    sanitized.includes("[redacted]");
  devLog(`AiProviderError no secrets in logs ${ok ? "OK" : "FAIL"}`, {
    sanitizedPreview: sanitized.slice(0, 80),
  });
}

function devCheckStateNoSecrets(): void {
  withEnv(
    {
      QWEN_API_KEY: "super-secret-qwen-key",
      QWEN_MODEL: "gpt://folder/qwen/latest",
      YANDEX_GPT_API_KEY: "super-secret-yandex-key",
      YANDEX_CLOUD_FOLDER_ID: "folder-1",
    },
    () => {
      const qwenDiag = JSON.stringify(qwenStateForDiagnostics(getQwenState()));
      const yandexDiag = JSON.stringify(yandexStateForDiagnostics(getYandexGptState()));
      const ok =
        !qwenDiag.includes("super-secret") &&
        !yandexDiag.includes("super-secret");
      devLog(`provider state no API keys ${ok ? "OK" : "FAIL"}`, {
        qwenPreview: qwenDiag.slice(0, 120),
      });
    },
  );
}

export function devLogAiProviderHardeningChecks(): void {
  devLog("ai-provider hardening self-checks");
  devCheckHttpSettingsDefaults();
  devCheckHttpSettingsFromEnv();
  devCheckRetryableStatuses();
  devCheckRetryableProviderError();
  devCheckRetryBackoff();
  devCheckEmptyQwenResponse();
  devCheckAiProviderErrorNoSecrets();
  devCheckStateNoSecrets();
}
