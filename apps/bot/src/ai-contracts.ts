import { join } from "node:path";

/**
 * Всегда грузим intent-схему из свежей сборки монорепо,
 * а не из потенциально устаревшего apps/bot/node_modules.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const contracts = require(join(__dirname, "../../../packages/ai-contracts/dist/index.js")) as typeof import("@neportal/ai-contracts");

export const {
  AiIntentSchema,
  safeParseAiIntent,
  parseAiIntent,
  preprocessAiIntentInput,
} = contracts;

export type AiIntent = import("@neportal/ai-contracts").AiIntent;

let schemaProbeDone = false;

/** Проверка, что подключена intent-based схема, а не legacy version/action/entity. */
export function assertAiContractsSchemaLoaded(): void {
  if (schemaProbeDone) return;
  schemaProbeDone = true;

  const probe = safeParseAiIntent({
    intent: "create_note",
    confidence: 1,
    requiresConfirmation: true,
    payload: { text: "schema-probe" },
  });

  if (probe.success) return;

  const fieldErrors = probe.error.flatten().fieldErrors;
  const legacyKeys = ["version", "action", "entity"].filter((k) => k in fieldErrors);
  if (legacyKeys.length > 0) {
    console.error(
      [
        "[yandex-gpt] Подключена устаревшая схема @neportal/ai-contracts (version/action/entity).",
        "Выполните: pnpm --filter @neportal/ai-contracts build",
        "Затем перезапустите бота.",
      ].join(" "),
    );
  }
}
