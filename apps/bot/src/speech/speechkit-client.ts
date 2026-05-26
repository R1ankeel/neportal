import { extractRequestId } from "../ai/provider/http";
import { getSpeechKitConfig } from "./speechkit-config";
import type { SpeechRecognitionInput, SpeechRecognitionResult } from "./types";
import { SpeechKitError } from "./types";

const SPEECHKIT_PROVIDER = "yandex-speechkit";
const BYTES_IN_MB = 1024 * 1024;

function sanitizeSpeechKitErrorText(text: string): string {
  let sanitized = text.slice(0, 500);
  const patterns = [
    /\bapi[-_]?key\s*[:=]\s*\S+/gi,
    /\bauthorization\s*:\s*[^\n]+/gi,
    /\byc1_[A-Za-z0-9_-]{8,}\b/g,
  ];
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  return sanitized;
}

function isTimeoutError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.message.toLowerCase().includes("aborted"))
  );
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (isTimeoutError(err)) return false;
  return (
    err.name === "TypeError" ||
    err.message.includes("fetch failed") ||
    err.message.includes("ECONNREFUSED") ||
    err.message.includes("ENOTFOUND") ||
    err.message.toLowerCase().includes("network")
  );
}

function parseResultText(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const value = (body as { result?: unknown }).result;
  return typeof value === "string" ? value.trim() : undefined;
}

export function validateSpeechKitFileSize(audioSizeBytes: number, maxFileSizeMb: number): void {
  const maxBytes = Math.max(1, Math.floor(maxFileSizeMb * BYTES_IN_MB));
  if (audioSizeBytes > maxBytes) {
    throw new SpeechKitError({
      code: "SPEECHKIT_FILE_TOO_LARGE",
      message: `provider=${SPEECHKIT_PROVIDER} code=SPEECHKIT_FILE_TOO_LARGE`,
      retryable: false,
      details: { maxFileSizeMb, audioSizeBytes },
    });
  }
}

export async function recognizeOggOpus(
  input: SpeechRecognitionInput,
): Promise<SpeechRecognitionResult> {
  const cfg = getSpeechKitConfig();
  if (!cfg.enabled) {
    throw new SpeechKitError({
      code: "SPEECHKIT_NOT_ENABLED",
      message: `provider=${SPEECHKIT_PROVIDER} code=SPEECHKIT_NOT_ENABLED`,
      retryable: false,
    });
  }
  if (!cfg.apiKey || !cfg.folderId) {
    throw new SpeechKitError({
      code: "SPEECHKIT_NOT_CONFIGURED",
      message: `provider=${SPEECHKIT_PROVIDER} code=SPEECHKIT_NOT_CONFIGURED`,
      retryable: false,
      details: {
        hasApiKey: !!cfg.apiKey,
        hasFolderId: !!cfg.folderId,
      },
    });
  }

  const format = input.format ?? cfg.format;
  const language = input.language ?? cfg.language;
  const folderId = input.folderId ?? cfg.folderId;
  validateSpeechKitFileSize(input.audioBuffer.byteLength, cfg.maxFileSizeMb);

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  const url = new URL(cfg.endpoint);
  url.searchParams.set("folderId", folderId);
  url.searchParams.set("lang", language);
  url.searchParams.set("format", format);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${cfg.apiKey}`,
        "Content-Type": "application/octet-stream",
      },
      body: input.audioBuffer,
      signal: controller.signal,
    });

    const bodyText = await res.text().catch(() => "");
    let parsedBody: unknown;
    try {
      parsedBody = bodyText ? (JSON.parse(bodyText) as unknown) : {};
    } catch (err) {
      throw new SpeechKitError({
        code: "SPEECHKIT_RESPONSE_PARSE_ERROR",
        message: `provider=${SPEECHKIT_PROVIDER} code=SPEECHKIT_RESPONSE_PARSE_ERROR`,
        retryable: false,
        details: { detail: sanitizeSpeechKitErrorText(String(err)) },
        cause: err,
      });
    }

    if (!res.ok) {
      const requestId = extractRequestId(res.headers, parsedBody);
      throw new SpeechKitError({
        code: "SPEECHKIT_HTTP_ERROR",
        status: res.status,
        requestId,
        retryable: res.status === 408 || res.status === 429 || res.status >= 500,
        message: `provider=${SPEECHKIT_PROVIDER} code=SPEECHKIT_HTTP_ERROR status=${res.status}`,
        details: { detail: sanitizeSpeechKitErrorText(bodyText) },
      });
    }

    const text = parseResultText(parsedBody);
    if (!text) {
      throw new SpeechKitError({
        code: "SPEECHKIT_EMPTY_RESULT",
        message: `provider=${SPEECHKIT_PROVIDER} code=SPEECHKIT_EMPTY_RESULT`,
        retryable: false,
      });
    }

    return {
      text,
      provider: SPEECHKIT_PROVIDER,
      durationMs: Date.now() - startedAt,
      raw: parsedBody,
    };
  } catch (err) {
    if (err instanceof SpeechKitError) throw err;

    if (isTimeoutError(err)) {
      throw new SpeechKitError({
        code: "SPEECHKIT_TIMEOUT",
        timeoutMs: cfg.timeoutMs,
        retryable: true,
        message: `provider=${SPEECHKIT_PROVIDER} code=SPEECHKIT_TIMEOUT timeoutMs=${cfg.timeoutMs}`,
        cause: err,
      });
    }
    if (isNetworkError(err)) {
      throw new SpeechKitError({
        code: "SPEECHKIT_NETWORK_ERROR",
        retryable: true,
        message: `provider=${SPEECHKIT_PROVIDER} code=SPEECHKIT_NETWORK_ERROR`,
        cause: err,
      });
    }
    throw new SpeechKitError({
      code: "SPEECHKIT_UNKNOWN_ERROR",
      retryable: false,
      message: `provider=${SPEECHKIT_PROVIDER} code=SPEECHKIT_UNKNOWN_ERROR`,
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }
}

