import type { AiIntent } from "./ai-contracts";
import { inferBudgetHintFromText } from "./budget-resolver";

const EXPENSE_VERB =
  /^(потратил|потратила|потратили|потрачено|израсходовал|израсходовала|израсходовали|заплатил|заплатила|заплатили|оплатил|оплатила|оплатили)\s+/i;

const EXPENSE_BODY =
  /^(\d[\d\s]*(?:[.,]\d+)?)\s*(?:руб(?:лей|ля)?\.?|₽|\sр\.?)?(?:\s+на\s+(.+))?$/i;

function normalizeExpenseInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[?!.,;:]+$/g, "").trim();
}

/** Сохраняет регистр из исходного текста для описания расхода. */
function extractDescriptionPreservingCase(originalText: string, normalizedCapture: string): string {
  const needle = normalizedCapture.trim();
  if (!needle) return "";

  const origLower = originalText.toLowerCase().replace(/ё/g, "е");
  const needleLower = needle.replace(/ё/g, "е");
  const idx = origLower.indexOf(needleLower);
  if (idx >= 0) {
    return stripTrailingPunctuation(originalText.slice(idx, idx + needle.length));
  }
  return stripTrailingPunctuation(needle);
}

function parseAmount(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

/**
 * Детерминированный разбор «Потратил N … на …» без LLM.
 * Обходит отказы YandexGPT на учёт расходов.
 */
export function parseExpenseQuery(text: string): Extract<AiIntent, { intent: "create_expense" }> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const normalized = normalizeExpenseInput(trimmed);
  if (!EXPENSE_VERB.test(normalized)) return null;

  const withoutVerb = normalized.replace(EXPENSE_VERB, "");
  const bodyMatch = withoutVerb.match(EXPENSE_BODY);
  if (!bodyMatch?.[1]) return null;

  const amount = parseAmount(bodyMatch[1]);
  if (amount == null) return null;

  const payload: {
    amount: number;
    description?: string;
    budgetHint?: string;
  } = { amount };

  const descriptionNorm = bodyMatch[2]?.trim();
  if (descriptionNorm) {
    const description = extractDescriptionPreservingCase(trimmed, descriptionNorm);
    if (description) {
      payload.description = description;
      const budgetHint = inferBudgetHintFromText(description);
      if (budgetHint) {
        payload.budgetHint = budgetHint;
      }
    }
  }

  return {
    intent: "create_expense",
    confidence: 0.92,
    requiresConfirmation: true,
    payload,
  };
}
