export type YandexGptTokenUsage = {
  inputTextTokens: number;
  completionTokens: number;
  totalTokens: number;
};

function parseTokenCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return null;
}

/** Извлекает usage из result YandexGPT (поля могут быть string или number). */
export function parseYandexGptUsage(usage: unknown): YandexGptTokenUsage | null {
  if (typeof usage !== "object" || usage === null || Array.isArray(usage)) {
    return null;
  }

  const u = usage as Record<string, unknown>;
  const inputTextTokens = parseTokenCount(u.inputTextTokens);
  const completionTokens = parseTokenCount(u.completionTokens);
  const totalFromApi = parseTokenCount(u.totalTokens);

  if (inputTextTokens === null && completionTokens === null && totalFromApi === null) {
    return null;
  }

  const input = inputTextTokens ?? 0;
  const output = completionTokens ?? 0;
  const total = totalFromApi ?? input + output;

  return {
    inputTextTokens: input,
    completionTokens: output,
    totalTokens: total,
  };
}

export function addTokenUsage(
  a: YandexGptTokenUsage | null,
  b: YandexGptTokenUsage | null,
): YandexGptTokenUsage | null {
  if (!a) return b;
  if (!b) return a;
  return {
    inputTextTokens: a.inputTextTokens + b.inputTextTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/** Логирует расход токенов одного запроса к YandexGPT. */
export function logYandexGptTokenUsage(
  promptGroup: string,
  usage: YandexGptTokenUsage | null,
): void {
  if (!usage) {
    console.log(`[yandex-gpt] tokens promptGroup=${promptGroup} usage=unavailable`);
    return;
  }

  console.log(
    `[yandex-gpt] tokens promptGroup=${promptGroup} input=${usage.inputTextTokens} output=${usage.completionTokens} total=${usage.totalTokens}`,
  );
}

/** Сводка по нескольким вызовам за один parseTextIntent. */
export function logYandexGptTokenUsageTotal(usage: YandexGptTokenUsage | null): void {
  if (!usage) return;
  console.log(
    `[yandex-gpt] tokens parseTextIntent total input=${usage.inputTextTokens} output=${usage.completionTokens} total=${usage.totalTokens}`,
  );
}
