export type AiProviderId = "yandex" | "qwen";

export type AiTokenUsage = {
  inputTextTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiCompletionParams = {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  requestLabel?: string;
  promptGroup?: string;
};

export type AiCompletionResult = {
  text: string;
  usage: AiTokenUsage | null;
  raw?: unknown;
  model?: string;
  provider: AiProviderId;
  latencyMs?: number;
};

export interface AiProvider {
  id: AiProviderId;
  complete(params: AiCompletionParams): Promise<AiCompletionResult>;
}

export type AiProviderDisabledReason = "missing_env" | "placeholder_env";

/** Безопасная диагностика provider (без секретов). */
export type AiProviderDiagnostics = {
  provider: AiProviderId;
  configured: boolean;
  model?: string;
  endpoint?: string;
  baseUrl?: string;
  authType?: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  reason?: AiProviderDisabledReason;
  missingEnv?: string[];
};

export type AiProviderState =
  | { enabled: true; providerId: AiProviderId; model?: string; diagnostics: AiProviderDiagnostics }
  | {
      enabled: false;
      providerId: AiProviderId;
      reason: AiProviderDisabledReason;
      diagnostics: AiProviderDiagnostics;
    };
