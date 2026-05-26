import { extractRequestId } from "../ai/provider/http";
import { getSpeechKitConfig } from "./speechkit-config";
import type { SpeechRecognitionResult } from "./types";
import { SpeechKitError } from "./types";

type AsyncOperationResponse = {
  id?: string;
  done?: boolean;
  error?: { message?: string; code?: number };
  response?: unknown;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeErrorText(text: string): string {
  return text.slice(0, 500).replace(/\bapi[-_]?key\s*[:=]\s*\S+/gi, "[redacted]");
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function collectTextsFromNode(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectTextsFromNode(item, out);
    return;
  }
  const record = node as Record<string, unknown>;
  const alternatives = record.alternatives;
  if (Array.isArray(alternatives)) {
    for (const alt of alternatives) {
      if (!alt || typeof alt !== "object") continue;
      const text = (alt as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) {
        out.push(text.trim());
      }
    }
  }
  for (const value of Object.values(record)) {
    collectTextsFromNode(value, out);
  }
}

function extractAsyncText(response: unknown): string {
  const chunks: string[] = [];
  collectTextsFromNode(response, chunks);
  return normalizeText(chunks.join(" "));
}

export async function startAsyncRecognition(params: { objectUri: string }): Promise<{ operationId: string }> {
  const cfg = getSpeechKitConfig();
  if (!cfg.apiKey || !cfg.folderId) {
    throw new SpeechKitError({
      code: "SPEECHKIT_NOT_CONFIGURED",
      message: "provider=yandex-speechkit code=SPEECHKIT_NOT_CONFIGURED",
      retryable: false,
    });
  }

  const body = {
    config: {
      specification: {
        languageCode: cfg.language,
        model: cfg.asyncModel,
        profanityFilter: false,
      },
    },
    audio: {
      uri: params.objectUri,
    },
  };

  const res = await fetch(cfg.asyncEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const bodyText = await res.text().catch(() => "");
  let parsed: AsyncOperationResponse = {};
  try {
    parsed = bodyText ? (JSON.parse(bodyText) as AsyncOperationResponse) : {};
  } catch {
    throw new SpeechKitError({
      code: "SPEECHKIT_ASYNC_START_ERROR",
      retryable: false,
      status: res.status,
      requestId: extractRequestId(res.headers, bodyText),
      details: { detail: sanitizeErrorText(bodyText) },
    });
  }

  if (!res.ok) {
    throw new SpeechKitError({
      code: "SPEECHKIT_ASYNC_START_ERROR",
      retryable: res.status === 408 || res.status === 429 || res.status >= 500,
      status: res.status,
      requestId: extractRequestId(res.headers, parsed),
      details: { detail: sanitizeErrorText(bodyText) },
    });
  }

  const operationId = parsed.id?.trim();
  if (!operationId) {
    throw new SpeechKitError({
      code: "SPEECHKIT_ASYNC_START_ERROR",
      retryable: false,
      details: { detail: "Missing operation id" },
    });
  }

  return { operationId };
}

export async function pollAsyncRecognition(operationId: string): Promise<SpeechRecognitionResult> {
  const cfg = getSpeechKitConfig();
  if (!cfg.apiKey) {
    throw new SpeechKitError({
      code: "SPEECHKIT_NOT_CONFIGURED",
      retryable: false,
    });
  }

  const startedAt = Date.now();
  const pollUrl = `${cfg.asyncOperationsEndpoint.replace(/\/$/, "")}/${encodeURIComponent(operationId)}`;

  while (Date.now() - startedAt < cfg.asyncTimeoutMs) {
    const res = await fetch(pollUrl, {
      method: "GET",
      headers: {
        Authorization: `Api-Key ${cfg.apiKey}`,
      },
    });

    const bodyText = await res.text().catch(() => "");
    let parsed: AsyncOperationResponse = {};
    try {
      parsed = bodyText ? (JSON.parse(bodyText) as AsyncOperationResponse) : {};
    } catch {
      throw new SpeechKitError({
        code: "SPEECHKIT_ASYNC_POLL_ERROR",
        retryable: true,
        status: res.status,
        requestId: extractRequestId(res.headers, bodyText),
        details: { detail: sanitizeErrorText(bodyText) },
      });
    }

    if (!res.ok) {
      throw new SpeechKitError({
        code: "SPEECHKIT_ASYNC_POLL_ERROR",
        retryable: res.status === 408 || res.status === 429 || res.status >= 500,
        status: res.status,
        requestId: extractRequestId(res.headers, parsed),
        details: { detail: sanitizeErrorText(bodyText) },
      });
    }

    if (!parsed.done) {
      await delay(cfg.asyncPollIntervalMs);
      continue;
    }

    if (parsed.error) {
      throw new SpeechKitError({
        code: "SPEECHKIT_ASYNC_POLL_ERROR",
        retryable: false,
        details: {
          detail: sanitizeErrorText(parsed.error.message ?? "async operation failed"),
          opCode: parsed.error.code,
        },
      });
    }

    const text = extractAsyncText(parsed.response);
    if (!text) {
      throw new SpeechKitError({
        code: "SPEECHKIT_EMPTY_RESULT",
        retryable: false,
      });
    }

    return {
      provider: "yandex-speechkit",
      text,
      model: cfg.asyncModel,
      durationMs: Date.now() - startedAt,
      raw: parsed.response,
    };
  }

  throw new SpeechKitError({
    code: "SPEECHKIT_ASYNC_TIMEOUT",
    retryable: true,
    timeoutMs: cfg.asyncTimeoutMs,
  });
}

export async function recognizeOggOpusAsyncFromObject(params: {
  objectUri: string;
}): Promise<SpeechRecognitionResult> {
  const startedAt = Date.now();
  const { operationId } = await startAsyncRecognition({ objectUri: params.objectUri });
  const result = await pollAsyncRecognition(operationId);
  return {
    ...result,
    durationMs: Date.now() - startedAt,
  };
}
