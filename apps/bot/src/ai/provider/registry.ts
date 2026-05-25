import type { AiProvider, AiProviderId, AiProviderState } from "./types";
import { createYandexGptProvider, getYandexAiProviderState } from "./yandex-provider";

function normalizeProviderId(raw: string | undefined): string {
  return (raw?.trim() || "yandex").toLowerCase();
}

function warnUnknownProvider(requested: string): void {
  console.warn(
    `[ai-provider] unknown AI_PROVIDER="${requested}", falling back to yandex`,
  );
}

/** Текущий primary provider id из AI_PROVIDER (default: yandex). */
export function resolveAiProviderId(): AiProviderId {
  const id = normalizeProviderId(process.env.AI_PROVIDER);
  if (id === "yandex") return "yandex";
  warnUnknownProvider(id);
  return "yandex";
}

/** Состояние primary provider (enabled / model) без создания HTTP-клиента. */
export function getAiProviderState(): AiProviderState {
  const requested = normalizeProviderId(process.env.AI_PROVIDER);
  if (requested !== "yandex" && requested !== "") {
    warnUnknownProvider(requested);
  }
  return getYandexAiProviderState();
}

/** Primary AI provider для completion-вызовов. */
export function getPrimaryAiProvider(): AiProvider {
  const id = resolveAiProviderId();
  switch (id) {
    case "yandex":
      return createYandexGptProvider();
    default:
      return createYandexGptProvider();
  }
}
