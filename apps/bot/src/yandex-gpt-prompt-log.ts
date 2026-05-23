import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type YandexPromptLogReason = "invalid_json" | "invalid_schema" | "api_refusal";

export type YandexPromptLogPayload = {
  reason: YandexPromptLogReason;
  userText: string;
  systemPrompt: string;
  userPrompt: string;
  modelResponse: string;
  modelUri?: string;
  extra?: Record<string, unknown>;
};

const REFUSAL_MARKERS = [
  "не могу обсуждать",
  "давайте поговорим",
  "я не могу",
  "cannot discuss",
];

export function isYandexGptRefusalResponse(text: string): boolean {
  const lower = text.toLowerCase();
  return REFUSAL_MARKERS.some((m) => lower.includes(m));
}

export function resolveYandexPromptLogDir(): string {
  const fromEnv = process.env.BOT_YANDEX_PROMPT_LOG_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "logs", "yandex-gpt");
}

/** Сохраняет system/user prompt и ответ модели в файл (для отладки отказов YandexGPT). */
export async function saveYandexGptPromptLog(
  payload: YandexPromptLogPayload,
): Promise<string | null> {
  const dir = resolveYandexPromptLogDir();
  try {
    await mkdir(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(dir, `${ts}_${payload.reason}.txt`);
    const extraBlock =
      payload.extra && Object.keys(payload.extra).length > 0
        ? `\n=== extra ===\n${JSON.stringify(payload.extra, null, 2)}\n`
        : "";

    const body = [
      `reason: ${payload.reason}`,
      `time: ${new Date().toISOString()}`,
      `modelUri: ${payload.modelUri ?? "n/a"}`,
      "",
      "=== user message ===",
      payload.userText,
      "",
      "=== model response ===",
      payload.modelResponse,
      extraBlock,
      "=== user prompt (context + text) ===",
      payload.userPrompt,
      "",
      "=== system prompt ===",
      payload.systemPrompt,
      "",
    ].join("\n");

    await appendFile(filePath, body, "utf8");
    return filePath;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] failed to save prompt log: ${msg}`);
    return null;
  }
}
