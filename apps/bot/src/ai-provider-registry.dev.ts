import { devLog } from "./dev-log";
import {
  getAiProviderState,
  getPrimaryAiProvider,
  resolveAiProviderId,
} from "./ai/provider/registry";
import {
  getQwenState,
  mapQwenChatCompletionResponse,
  parseQwenOpenAiUsage,
  qwenStateForDiagnostics,
  resolveQwenFolderId,
} from "./ai/provider/qwen-provider";

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(keys: string[]): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const key of keys) {
    snap[key] = process.env[key];
  }
  return snap;
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snap)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function withEnv(
  patch: Record<string, string | undefined>,
  fn: () => void,
): void {
  const keys = Object.keys(patch);
  const snap = snapshotEnv(["AI_PROVIDER", "QWEN_API_KEY", ...keys]);
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

function devCheckResolveAiProviderId(): void {
  const cases: Array<{ patch: Record<string, string | undefined>; expected: string }> = [
    { patch: { AI_PROVIDER: undefined }, expected: "yandex" },
    { patch: { AI_PROVIDER: "" }, expected: "yandex" },
    { patch: { AI_PROVIDER: "yandex" }, expected: "yandex" },
    { patch: { AI_PROVIDER: "qwen" }, expected: "qwen" },
    { patch: { AI_PROVIDER: "unknown" }, expected: "yandex" },
  ];

  for (const { patch, expected } of cases) {
    withEnv(patch, () => {
      const got = resolveAiProviderId();
      const ok = got === expected;
      devLog(`resolveAiProviderId ${ok ? "OK" : "FAIL"}`, { patch, expected, got });
    });
  }
}

function devCheckGetPrimaryAiProvider(): void {
  withEnv(
    {
      AI_PROVIDER: "qwen",
      QWEN_API_KEY: "test-key-dev-only",
      QWEN_MODEL: "gpt://test-folder/qwen-test/latest",
      QWEN_AUTH_TYPE: "api-key",
    },
    () => {
    const provider = getPrimaryAiProvider();
    const ok = provider.id === "qwen";
    devLog(`getPrimaryAiProvider qwen ${ok ? "OK" : "FAIL"}`, { id: provider.id });
    },
  );

  withEnv({ AI_PROVIDER: undefined }, () => {
    const provider = getPrimaryAiProvider();
    const ok = provider.id === "yandex";
    devLog(`getPrimaryAiProvider default ${ok ? "OK" : "FAIL"}`, { id: provider.id });
  });
}

function devCheckQwenStateNoSecrets(): void {
  withEnv(
    {
      QWEN_API_KEY: "secret-should-not-appear",
      QWEN_MODEL: "gpt://folder-id/qwen-model/latest",
      QWEN_AUTH_TYPE: "api-key",
    },
    () => {
    const state = getQwenState();
    const diag = JSON.stringify(qwenStateForDiagnostics(state));
    const leaksKey = diag.includes("secret-should-not-appear");
    const hasApiKeyField =
      typeof diag === "string" &&
      (diag.includes('"hasApiKey":true') || diag.includes('"hasApiKey":false'));
    devLog(`qwenState no API key leak ${!leaksKey ? "OK" : "FAIL"}`, {
      hasApiKeyField,
      preview: diag.slice(0, 200),
    });
    },
  );

  withEnv({ QWEN_API_KEY: undefined, AI_PROVIDER: "qwen" }, () => {
    const providerState = getAiProviderState();
    const ok =
      providerState.enabled === false &&
      providerState.providerId === "qwen" &&
      providerState.reason === "missing_env";
    devLog(`getAiProviderState qwen missing key ${ok ? "OK" : "FAIL"}`, {
      providerState,
    });
  });
}

function devCheckQwenFolderFromModelUri(): void {
  const got = resolveQwenFolderId("gpt://my-folder/qwen3/latest");
  const ok = got === "my-folder";
  devLog(`resolveQwenFolderId ${ok ? "OK" : "FAIL"}`, { got });
}

function devCheckQwenUsageMapping(): void {
  const usage = parseQwenOpenAiUsage({
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
  });
  const ok =
    usage?.inputTextTokens === 10 &&
    usage.completionTokens === 5 &&
    usage.totalTokens === 15;
  devLog(`parseQwenOpenAiUsage ${ok ? "OK" : "FAIL"}`, { usage });
}

function devCheckQwenResponseMapping(): void {
  const result = mapQwenChatCompletionResponse(
    {
      model: "gpt://folder/qwen/latest",
      choices: [{ message: { content: '{"intent":"unknown"}' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    },
    "gpt://folder/qwen-fallback/latest",
  );
  const ok =
    result.provider === "qwen" &&
    result.text.includes("unknown") &&
    result.model === "gpt://folder/qwen/latest" &&
    result.usage?.totalTokens === 3;
  devLog(`mapQwenChatCompletionResponse ${ok ? "OK" : "FAIL"}`, {
    provider: result.provider,
    model: result.model,
    usage: result.usage,
  });
}

function devCheckQwenCompleteMissingKey(): void {
  withEnv({ AI_PROVIDER: "qwen", QWEN_API_KEY: undefined }, () => {
    void (async () => {
      const provider = getPrimaryAiProvider();
      let message = "";
      try {
        await provider.complete({
          systemPrompt: "test",
          userPrompt: "test",
        });
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      const ok = message.includes("QWEN_API_KEY") || message.includes("QWEN_MODEL");
      devLog(`qwen complete missing key ${ok ? "OK" : "FAIL"}`, { message });
    })();
  });
}

export function devLogAiProviderRegistryChecks(): void {
  devLog("ai-provider registry self-checks");
  devCheckResolveAiProviderId();
  devCheckGetPrimaryAiProvider();
  devCheckQwenStateNoSecrets();
  devCheckQwenFolderFromModelUri();
  devCheckQwenUsageMapping();
  devCheckQwenResponseMapping();
  devCheckQwenCompleteMissingKey();
}
