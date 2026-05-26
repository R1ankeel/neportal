import { devLog } from "../dev-log";
import { getSpeechKitState } from "./speechkit-config";
import { validateSpeechKitFileSize } from "./speechkit-client";
import { SpeechKitError } from "./types";

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(keys: string[]): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const key of keys) snap[key] = process.env[key];
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
    "YANDEX_SPEECHKIT_ENABLED",
    "YANDEX_SPEECHKIT_API_KEY",
    "YANDEX_SPEECHKIT_FOLDER_ID",
    "SPEECHKIT_API_KEY",
    "SPEECHKIT_FOLDER_ID",
    "YANDEX_SPEECHKIT_ASYNC_ENABLED",
    "YANDEX_SPEECHKIT_OBJECT_STORAGE_BUCKET",
    "YANDEX_STORAGE_ACCESS_KEY_ID",
    "YANDEX_STORAGE_SECRET_ACCESS_KEY",
    "YANDEX_STORAGE_ENDPOINT",
    "YANDEX_STORAGE_REGION",
    "YANDEX_SPEECHKIT_OBJECT_STORAGE_PREFIX",
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

function checkDefaultState(): void {
  withEnv(
    {
      YANDEX_SPEECHKIT_ENABLED: undefined,
      YANDEX_SPEECHKIT_API_KEY: undefined,
      YANDEX_SPEECHKIT_FOLDER_ID: undefined,
      SPEECHKIT_API_KEY: undefined,
      SPEECHKIT_FOLDER_ID: undefined,
      YANDEX_SPEECHKIT_ASYNC_ENABLED: undefined,
    },
    () => {
      const state = getSpeechKitState();
      const ok =
        state.enabled === false
        && state.configured === false
        && state.asyncEnabled === false
        && state.asyncConfigured === false;
      devLog(`speechkit default state ${ok ? "OK" : "FAIL"}`, {
        enabled: state.enabled,
        configured: state.configured,
        asyncEnabled: state.asyncEnabled,
        asyncConfigured: state.asyncConfigured,
      });
    },
  );
}

function checkMissingEnvWhenEnabled(): void {
  withEnv(
    {
      YANDEX_SPEECHKIT_ENABLED: "true",
      YANDEX_SPEECHKIT_API_KEY: undefined,
      YANDEX_SPEECHKIT_FOLDER_ID: undefined,
    },
    () => {
      const state = getSpeechKitState();
      const ok =
        state.configured === false &&
        (state.missingEnv ?? []).includes("YANDEX_SPEECHKIT_API_KEY") &&
        (state.missingEnv ?? []).includes("YANDEX_SPEECHKIT_FOLDER_ID");
      devLog(`speechkit enabled without creds ${ok ? "OK" : "FAIL"}`, {
        configured: state.configured,
        missingEnv: state.missingEnv,
      });
    },
  );
}

function checkStateHasNoSecret(): void {
  withEnv(
    {
      YANDEX_SPEECHKIT_ENABLED: "true",
      YANDEX_SPEECHKIT_API_KEY: "super-secret-key",
      YANDEX_SPEECHKIT_FOLDER_ID: "folder-1",
      YANDEX_SPEECHKIT_ASYNC_ENABLED: "true",
      YANDEX_SPEECHKIT_OBJECT_STORAGE_BUCKET: "bucket",
      YANDEX_STORAGE_ACCESS_KEY_ID: "AKIA-SECRET",
      YANDEX_STORAGE_SECRET_ACCESS_KEY: "SUPER-SECRET",
    },
    () => {
      const stateJson = JSON.stringify(getSpeechKitState());
      const ok =
        !stateJson.includes("super-secret-key")
        && !stateJson.includes("AKIA-SECRET")
        && !stateJson.includes("SUPER-SECRET");
      devLog(`speechkit state has no api key ${ok ? "OK" : "FAIL"}`);
    },
  );
}

function checkAsyncNeedsStorageConfig(): void {
  withEnv(
    {
      YANDEX_SPEECHKIT_ENABLED: "true",
      YANDEX_SPEECHKIT_API_KEY: "key",
      YANDEX_SPEECHKIT_FOLDER_ID: "folder",
      YANDEX_SPEECHKIT_ASYNC_ENABLED: "true",
      YANDEX_SPEECHKIT_OBJECT_STORAGE_BUCKET: undefined,
      YANDEX_STORAGE_ACCESS_KEY_ID: undefined,
      YANDEX_STORAGE_SECRET_ACCESS_KEY: undefined,
      YANDEX_STORAGE_ENDPOINT: undefined,
      YANDEX_STORAGE_REGION: undefined,
    },
    () => {
      const state = getSpeechKitState();
      const ok = state.asyncEnabled === true && state.asyncConfigured === false;
      devLog(`speechkit async requires storage ${ok ? "OK" : "FAIL"}`, {
        asyncEnabled: state.asyncEnabled,
        asyncConfigured: state.asyncConfigured,
        missingEnv: state.missingEnv,
      });
    },
  );
}

function checkFileSizeValidation(): void {
  let code = "";
  try {
    validateSpeechKitFileSize(2 * 1024 * 1024, 1);
  } catch (err) {
    if (err instanceof SpeechKitError) code = err.code;
  }
  devLog(`speechkit file size guard ${code === "SPEECHKIT_FILE_TOO_LARGE" ? "OK" : "FAIL"}`, {
    code,
  });
}

export function devLogSpeechKitConfigChecks(): void {
  devLog("speechkit config self-checks");
  checkDefaultState();
  checkMissingEnvWhenEnabled();
  checkStateHasNoSecret();
  checkAsyncNeedsStorageConfig();
  checkFileSizeValidation();
}
