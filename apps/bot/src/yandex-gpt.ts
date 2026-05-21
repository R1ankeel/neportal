import { safeParseAiIntent, type AiIntent } from "@neportal/ai-contracts";
import {
  formatPromptContextForModel,
  loadIntentPromptContext,
  type IntentPromptContext,
} from "./intent-context";

const YANDEX_COMPLETION_URL =
  "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";

export type YandexGptConfig = {
  folderId: string;
  iamToken: string;
  modelUri: string;
};

export type YandexGptDisabledReason = "missing_env" | "placeholder_env";

export type YandexGptState =
  | { enabled: true; config: YandexGptConfig }
  | { enabled: false; reason: YandexGptDisabledReason };

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  return v.length === 0 || v === "change_me";
}

export function getYandexGptState(): YandexGptState {
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID?.trim();
  const iamToken = process.env.YANDEX_CLOUD_IAM_TOKEN?.trim();
  const modelUriRaw = process.env.YANDEX_GPT_MODEL_URI?.trim();

  if (isPlaceholder(folderId) || isPlaceholder(iamToken)) {
    return { enabled: false, reason: "missing_env" };
  }

  const modelUri =
    isPlaceholder(modelUriRaw) && folderId
      ? `gpt://${folderId}/yandexgpt/latest`
      : (modelUriRaw as string);

  if (isPlaceholder(modelUri)) {
    return { enabled: false, reason: "missing_env" };
  }

  return {
    enabled: true,
    config: { folderId: folderId!, iamToken: iamToken!, modelUri },
  };
}

const SYSTEM_PROMPT = `Ты парсер команд для Neportal.
Верни только один JSON-объект без markdown и без пояснений.
Не выполняй действия — только разбор текста пользователя.

Допустимые значения intent:
- create_task
- create_note
- create_expense
- create_absence
- set_task_deadline
- unknown

Структура ответа:
{
  "intent": "<один из intent выше>",
  "confidence": <число от 0 до 1>,
  "requiresConfirmation": true,
  "payload": { ... }
}

payload для create_task:
{ "projectHint"?: string, "assigneeHint"?: string, "title": string, "description"?: string, "deadlineDate"?: "YYYY-MM-DD" }

payload для create_note:
{ "projectHint"?: string, "text": string }

payload для create_expense:
{ "projectHint"?: string, "budgetHint"?: string, "amount": number, "description"?: string }

payload для create_absence:
{ "userHint"?: string, "type": "SICK_LEAVE" | "VACATION", "startDate"?: "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "documentNumber"?: string, "comment"?: string }

payload для set_task_deadline:
{ "taskTitle": string, "deadlineDate": "YYYY-MM-DD" }

payload для unknown:
{ "reason"?: string }

Правила:
- Даты только в формате YYYY-MM-DD.
- Если год не указан — используй 2026.
- «Завтра» и относительные даты считай от текущей даты из контекста.
- Сопоставляй имена, проекты и бюджеты со списками из контекста (hints — подстроки имён из списка).
- Для больничного type = SICK_LEAVE, для отпуска type = VACATION.
- Если команда непонятна — intent unknown, confidence низкая.
- requiresConfirmation всегда true для известных intent.`;

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

type YandexCompletionResponse = {
  result?: {
    alternatives?: Array<{
      message?: { text?: string };
      status?: string;
    }>;
  };
};

export type ParseTextIntentResult =
  | { ok: true; intent: AiIntent }
  | { ok: false; kind: "disabled" | "api_error" | "invalid_json" | "invalid_schema" };

export async function parseTextIntent(userText: string): Promise<ParseTextIntentResult> {
  const state = getYandexGptState();
  if (!state.enabled) {
    return { ok: false, kind: "disabled" };
  }

  let context: IntentPromptContext;
  try {
    context = await loadIntentPromptContext();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] failed to load context: ${msg}`);
    return { ok: false, kind: "api_error" };
  }

  const userPrompt = [
    formatPromptContextForModel(context),
    "",
    "Текст пользователя:",
    userText.trim(),
  ].join("\n");

  let responseText: string;
  try {
    responseText = await callYandexGpt(state.config, userPrompt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[yandex-gpt] request failed: ${msg}`);
    return { ok: false, kind: "api_error" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(responseText));
  } catch {
    console.error("[yandex-gpt] model returned non-JSON text");
    return { ok: false, kind: "invalid_json" };
  }

  const validated = safeParseAiIntent(parsed);
  if (!validated.success) {
    console.error("[yandex-gpt] schema validation failed", validated.error.flatten());
    return { ok: false, kind: "invalid_schema" };
  }

  return { ok: true, intent: validated.data };
}

async function callYandexGpt(config: YandexGptConfig, userPrompt: string): Promise<string> {
  const res = await fetch(YANDEX_COMPLETION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${config.iamToken}`,
      "x-folder-id": config.folderId,
    },
    body: JSON.stringify({
      modelUri: config.modelUri,
      completionOptions: {
        stream: false,
        temperature: 0.2,
        maxTokens: 2000,
      },
      messages: [
        { role: "system", text: SYSTEM_PROMPT },
        { role: "user", text: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YandexGPT HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as YandexCompletionResponse;
  const text = data.result?.alternatives?.[0]?.message?.text;
  if (!text?.trim()) {
    throw new Error("YandexGPT returned empty completion");
  }

  return text;
}
