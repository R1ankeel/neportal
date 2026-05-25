import type { AiProvider, AiProviderId, AiProviderState } from "./types";
import { createQwenProvider, getQwenAiProviderState } from "./qwen-provider";
import { createYandexGptProvider, getYandexAiProviderState } from "./yandex-provider";

const SUPPORTED_PROVIDERS: ReadonlySet<string> = new Set(["yandex", "qwen"]);

function normalizeProviderId(raw: string | undefined): string {
  return (raw?.trim() || "yandex").toLowerCase();
}

function warnUnknownProvider(requested: string): void {
  console.warn(
    `[ai-provider] unknown AI_PROVIDER="${requested}", falling back to yandex`,
  );
}

function parseAiProviderId(raw: string | undefined): AiProviderId {
  const id = normalizeProviderId(raw);
  if (SUPPORTED_PROVIDERS.has(id)) {
    return id as AiProviderId;
  }
  warnUnknownProvider(id);
  return "yandex";
}

/** Текущий primary provider id из AI_PROVIDER (default: yandex). */
export function resolveAiProviderId(): AiProviderId {
  return parseAiProviderId(process.env.AI_PROVIDER);
}

/** Состояние primary provider (enabled / model) без создания HTTP-клиента. */
export function getAiProviderState(): AiProviderState {
  const id = resolveAiProviderId();
  switch (id) {
    case "qwen":
      return getQwenAiProviderState();
    case "yandex":
    default:
      return getYandexAiProviderState();
  }
}

/** Primary AI provider для completion-вызовов. */
export function getPrimaryAiProvider(): AiProvider {
  const id = resolveAiProviderId();
  switch (id) {
    case "qwen":
      return createQwenProvider();
    case "yandex":
    default:
      return createYandexGptProvider();
  }
}
