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
    },
    () => {
      const state = getSpeechKitState();
      const ok = state.enabled === false && state.configured === false;
      devLog(`speechkit default state ${ok ? "OK" : "FAIL"}`, {
        enabled: state.enabled,
        configured: state.configured,
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
    },
    () => {
      const stateJson = JSON.stringify(getSpeechKitState());
      const ok = !stateJson.includes("super-secret-key");
      devLog(`speechkit state has no api key ${ok ? "OK" : "FAIL"}`);
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
  checkFileSizeValidation();
}

