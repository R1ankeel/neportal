import type { AiIntent } from "./ai-contracts";

const BUDGET_PREFIX =
  /^(?:создай|добавь|создайте|добавьте)\s+бюджет\s+/iu;

const RECEIPT_TRUE =
  /(?:^|\s|,)(?:чек\s+обязателен|обязателен\s+чек|отчетност\w*\s+обязательн\w*)(?:\s|,|$)/iu;
const RECEIPT_FALSE =
  /(?:^|\s|,)(?:чек\s+не\s+обязателен|без\s+чека|без\s+обязательного\s+чека)(?:\s|,|$)/iu;

const AMOUNT_ON_RE = /\bна\s+(\d[\d\s]*(?:[.,]\d+)?)\s*(?:руб(?:лей|ля)?\.?|₽|\sр\.?)?/iu;
const AMOUNT_TAIL_RE = /(\d[\d\s]*(?:[.,]\d+)?)\s*(?:руб(?:лей|ля)?\.?|₽|\sр\.?)?\s*$/iu;

const QUOTED_NAME_RE = /["«]([^"»]+)["»]/u;

function normalizeInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function parseAmount(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

function stripReceiptPhrases(text: string): { text: string; requiresReceipt?: boolean } {
  let t = text;
  let requiresReceipt: boolean | undefined;

  if (RECEIPT_TRUE.test(t)) {
    requiresReceipt = true;
    t = t.replace(RECEIPT_TRUE, " ").replace(/\s+/g, " ").trim();
  }
  if (RECEIPT_FALSE.test(t)) {
    requiresReceipt = false;
    t = t.replace(RECEIPT_FALSE, " ").replace(/\s+/g, " ").trim();
  }

  return { text: t, requiresReceipt };
}

function capitalizeBudgetName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase().replace(/ё/g, "е");
  let result = lower.charAt(0).toUpperCase() + lower.slice(1);
  result = result.replace(/\bvk\b/gi, "VK").replace(/\bвк\b/g, "ВК");
  return result;
}

function extractNameFromOriginal(original: string, nameNorm: string): string {
  const quoted = original.match(QUOTED_NAME_RE);
  if (quoted?.[1]) return quoted[1].trim();

  const needle = nameNorm.trim();
  if (!needle) return "";

  const origLower = original.toLowerCase().replace(/ё/g, "е");
  const needleLower = needle.replace(/ё/g, "е");
  const idx = origLower.indexOf(needleLower);
  if (idx >= 0) {
    return original.slice(idx, idx + needle.length).trim();
  }
  return capitalizeBudgetName(needle);
}

function extractAmountAndRemainder(text: string): { amount: number; remainder: string } | null {
  const onMatch = text.match(AMOUNT_ON_RE);
  if (onMatch?.[1]) {
    const amount = parseAmount(onMatch[1]);
    if (amount == null) return null;
    const remainder = text.replace(AMOUNT_ON_RE, " ").replace(/\s+/g, " ").trim();
    return { amount, remainder };
  }

  const tailMatch = text.match(AMOUNT_TAIL_RE);
  if (tailMatch?.[1]) {
    const amount = parseAmount(tailMatch[1]);
    if (amount == null) return null;
    const remainder = text.slice(0, tailMatch.index).trim();
    return { amount, remainder };
  }

  return null;
}

/**
 * Детерминированный разбор «создай бюджет …» без LLM.
 */
export function parseCreateBudgetCommand(
  text: string,
): Extract<AiIntent, { intent: "create_budget" }> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const normalized = normalizeInput(trimmed);
  if (!BUDGET_PREFIX.test(normalized)) return null;

  let body = normalized.replace(BUDGET_PREFIX, "").trim();
  if (!body) return null;

  const receipt = stripReceiptPhrases(body);
  body = receipt.text;

  const amountResult = extractAmountAndRemainder(body);
  if (!amountResult) return null;

  let nameNorm = amountResult.remainder.trim();
  if (!nameNorm) return null;

  const name = capitalizeBudgetName(extractNameFromOriginal(trimmed, nameNorm));
  if (!name) return null;

  const payload: Extract<AiIntent, { intent: "create_budget" }>["payload"] = {
    name,
    amount: amountResult.amount,
  };

  if (receipt.requiresReceipt !== undefined) {
    payload.requiresReceipt = receipt.requiresReceipt;
  }

  return {
    intent: "create_budget",
    confidence: 0.95,
    requiresConfirmation: true,
    payload,
  };
}
