import { requestAiJson } from "../yandex-gpt";

export type VoiceTextCleanupSource = "ai" | "none" | "fallback";

export type VoiceTextCleanupResult = {
  text: string;
  source: VoiceTextCleanupSource;
  changed: boolean;
};

export type CleanupRecognizedVoiceTextOptions = {
  mode?: "semantic" | "value";
  valueFieldKey?: string;
};

function isValidPayload(parsed: unknown): parsed is { text: string } {
  if (!parsed || typeof parsed !== "object") return false;
  const v = (parsed as { text?: unknown }).text;
  return typeof v === "string";
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isShortText(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return true;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length <= 2 && normalized.length <= 16) return true;
  if (/^[\d\s.,:/-]+$/u.test(normalized) && normalized.length <= 20) return true;
  return false;
}

function shouldUseAiCleanup(
  text: string,
  options?: CleanupRecognizedVoiceTextOptions,
): boolean {
  if (isShortText(text)) return false;
  if (!options || options.mode === "semantic") return true;
  if (options.mode === "value") {
    const fieldKey = (options.valueFieldKey ?? "").trim();
    if (!fieldKey) return false;
    if (fieldKey === "description" || fieldKey === "commentText" || fieldKey === "title" || fieldKey === "text") {
      return true;
    }
    return false;
  }
  return false;
}

const SYSTEM_PROMPT =
  "Ты очищаешь распознанный голосовой текст для бизнес-бота. " +
  "Удали слова-паразиты, очевидные повторы и мусор распознавания. " +
  "Сохрани смысл, имена, даты, суммы, числа, названия задач и намерение. " +
  "Не добавляй новых фактов. Верни только JSON {\"text\":\"...\"}.";

function buildUserPrompt(text: string): string {
  return [
    "Input:",
    `"${text}"`,
    "Output JSON:",
    "{\"text\":\"...\"}",
  ].join("\n");
}

export async function cleanupRecognizedVoiceText(
  text: string,
  options?: CleanupRecognizedVoiceTextOptions,
): Promise<VoiceTextCleanupResult> {
  const original = normalizeWhitespace(text);
  if (!original) {
    return { text: "", source: "none", changed: false };
  }

  if (!shouldUseAiCleanup(original, options)) {
    return { text: original, source: "none", changed: false };
  }

  try {
    const result = await requestAiJson({
      promptGroup: "voice-text-cleanup",
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(original),
      userText: original,
      temperature: 0,
      maxTokens: 120,
      validate: isValidPayload,
    });

    if (!result.ok || !isValidPayload(result.parsed)) {
      return { text: original, source: "fallback", changed: false };
    }

    const cleaned = normalizeWhitespace(result.parsed.text);
    if (!cleaned) {
      return { text: original, source: "fallback", changed: false };
    }

    return {
      text: cleaned,
      source: "ai",
      changed: cleaned !== original,
    };
  } catch {
    return { text: original, source: "fallback", changed: false };
  }
}
