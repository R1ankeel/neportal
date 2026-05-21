import { safeParseAiIntent, type AiIntent } from "@neportal/ai-contracts";
import {
  formatPromptContextForModel,
  loadIntentPromptContext,
  type IntentPromptContext,
} from "./intent-context";

const YANDEX_COMPLETION_URL =
  "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";

export type YandexGptAuthMode = "api-key" | "iam-token";

export type YandexGptConfig = {
  folderId: string;
  modelUri: string;
  authMode: YandexGptAuthMode;
  /** API key (Api-Key) or IAM token (Bearer), never logged. */
  credential: string;
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

function resolveAuth(): { authMode: YandexGptAuthMode; credential: string } | null {
  const apiKey = process.env.YANDEX_GPT_API_KEY?.trim();
  if (!isPlaceholder(apiKey)) {
    return { authMode: "api-key", credential: apiKey! };
  }

  const iamToken = process.env.YANDEX_CLOUD_IAM_TOKEN?.trim();
  if (!isPlaceholder(iamToken)) {
    return { authMode: "iam-token", credential: iamToken! };
  }

  return null;
}

function buildAuthorizationHeader(config: YandexGptConfig): string {
  if (config.authMode === "api-key") {
    return `Api-Key ${config.credential}`;
  }
  return `Bearer ${config.credential}`;
}

export function getYandexGptState(): YandexGptState {
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID?.trim();
  const modelUriRaw = process.env.YANDEX_GPT_MODEL_URI?.trim();

  if (isPlaceholder(folderId)) {
    return { enabled: false, reason: "missing_env" };
  }

  const auth = resolveAuth();
  if (!auth) {
    return { enabled: false, reason: "missing_env" };
  }

  const modelUri = isPlaceholder(modelUriRaw)
    ? `gpt://${folderId}/yandexgpt/latest`
    : modelUriRaw!;

  console.log(`[yandex-gpt] auth mode: ${auth.authMode}`);

  return {
    enabled: true,
    config: {
      folderId: folderId!,
      modelUri,
      authMode: auth.authMode,
      credential: auth.credential,
    },
  };
}

const SYSTEM_PROMPT = `Ты парсер команд для Neportal.
Верни ТОЛЬКО один JSON-объект. Без markdown, без \`\`\`, без текста до или после JSON.
Не выполняй действия — только разбор текста пользователя.

ЗАПРЕЩЕНО использовать поля: version, action, entity, rawText.
Используй ТОЛЬКО: intent, confidence, requiresConfirmation, payload.

JSON Schema ответа:
{
  "intent": "create_task" | "create_note" | "create_expense" | "create_absence" | "set_task_deadline" | "unknown",
  "confidence": number,
  "requiresConfirmation": boolean,
  "payload": object
}

payload по intent:

create_task.payload:
{ "projectHint"?: string, "assigneeHint"?: string, "title": string, "description"?: string, "deadlineDate"?: "YYYY-MM-DD" }

create_note.payload:
{ "projectHint"?: string, "text": string }

create_expense.payload:
{ "projectHint"?: string, "budgetHint"?: string, "amount": number, "description"?: string }

create_absence.payload:
{ "userHint"?: string, "type": "SICK_LEAVE" | "VACATION", "startDate"?: "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "documentNumber"?: string, "comment"?: string }

set_task_deadline.payload:
{ "taskTitle": string, "deadlineDate": "YYYY-MM-DD" }

unknown.payload:
{ "reason"?: string }

Пример create_note:
{
  "intent": "create_note",
  "confidence": 0.9,
  "requiresConfirmation": true,
  "payload": { "text": "клиент попросил завтра проверить статистику VK" }
}

Правила:
- Даты только YYYY-MM-DD; если год не указан — 2026.
- «Завтра» считай от текущей даты из контекста.
- hints сопоставляй со списками проектов/пользователей/бюджетов/задач из контекста.
- Больничный: type SICK_LEAVE; отпуск: VACATION.
- Если команда непонятна: intent unknown, низкая confidence.
- requiresConfirmation: true для всех известных intent.`;

/** Dev-only logs (отключить: BOT_DEV_LOG=0). */
function yandexGptDevLog(message: string, data?: Record<string, unknown>): void {
  if (process.env.BOT_DEV_LOG === "0") return;
  if (data && Object.keys(data).length > 0) {
    console.log(`[yandex-gpt] ${message}`, data);
  } else {
    console.log(`[yandex-gpt] ${message}`);
  }
}

/** Извлекает JSON из ответа модели, в т.ч. из блока \`\`\`json ... \`\`\`. */
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
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

  const jsonText = extractJsonText(responseText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    yandexGptDevLog("model returned non-JSON text", {
      preview: jsonText.slice(0, 500),
    });
    return { ok: false, kind: "invalid_json" };
  }

  yandexGptDevLog("raw AI JSON before validation", { parsed });

  const validated = safeParseAiIntent(parsed);
  if (!validated.success) {
    yandexGptDevLog("validation error", {
      fieldErrors: validated.error.flatten().fieldErrors,
      formErrors: validated.error.flatten().formErrors,
    });
    return { ok: false, kind: "invalid_schema" };
  }

  const intent = validated.data;
  yandexGptDevLog("parsed intent", {
    intent: intent.intent,
    confidence: intent.confidence,
    requiresConfirmation: intent.requiresConfirmation,
    payload: intent.payload,
  });

  return { ok: true, intent };
}

async function callYandexGpt(config: YandexGptConfig, userPrompt: string): Promise<string> {
  const res = await fetch(YANDEX_COMPLETION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: buildAuthorizationHeader(config),
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
