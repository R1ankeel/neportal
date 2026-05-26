import { devLog } from "../../dev-log";
import { requestAiJson } from "../../yandex-gpt";
import { getAiProviderState } from "../provider/registry";

export type StructuredDescriptionReason =
  | "none"
  | "originalTextLength"
  | "descriptionLength"
  | "enumerationMarkers";

export type StructuredDescriptionSource = "ai" | "deterministic" | "none" | "fallback";

export type ShouldStructureCreateTaskDescriptionParams = {
  originalText: string;
  title: string;
  description?: string | null;
};

export type NormalizeStructuredCreateTaskDescriptionParams = {
  originalText: string;
  title: string;
  description?: string | null;
  deadlineDate?: string;
};

export type NormalizeStructuredCreateTaskDescriptionResult = {
  title: string;
  description?: string;
  changed: boolean;
  source: StructuredDescriptionSource;
};

type StructuredDraft = {
  title: string;
  description?: string;
};

const ENUMERATION_RE =
  /\b(первое|второе|третье|четвертое|пятое|сначала|потом|затем|далее|также|и\s+еще|и\s+ещё)\b|(?:^|\s)\d+[.)]|(?:^|\n)\s*[-•]\s+/iu;
const FORBIDDEN_HEADERS_RE = /^(?:\s*)(?:план|подзадачи|чеклист)\s*:/iu;

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function countNumberedItems(text: string): number {
  return (text.match(/^\s*\d+\.\s+/gmu) ?? []).length;
}

function stripCommandPrefix(text: string): string {
  return text.replace(/^(?:создай|поставь|добавь)\s+задач[ауеыи]?\s+/iu, "").trim();
}

function splitIntoActionCandidates(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  return normalized
    .split(/\n|[.;!?]+/u)
    .map((part) => part.replace(/^\s*(?:[-•]|\d+[.)])\s*/u, "").trim())
    .filter(Boolean);
}

function dedupePreserveOrder(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function toNumbered(items: string[]): string {
  return items
    .map((item, index) => {
      const normalized = item.trim().replace(/\s+/g, " ");
      if (!normalized) return "";
      const withPunctuation = /[.!?]$/u.test(normalized) ? normalized : `${normalized}.`;
      return `${index + 1}. ${withPunctuation}`;
    })
    .filter(Boolean)
    .join("\n");
}

function roughOriginalItemsCount(text: string): number {
  const markerCount = (text.match(/(?:^|\s)\d+[.)]/gu) ?? []).length;
  const sentenceCount = splitIntoActionCandidates(text).length;
  return Math.max(markerCount, sentenceCount, 1);
}

function sanitizeTitle(title: string, fallback: string): string {
  const normalized = normalizeWhitespace(title);
  if (!normalized || normalized.length > 120) return fallback;
  return normalized;
}

function isSafeStructuredDescription(
  originalText: string,
  previousDescription: string | undefined,
  after: StructuredDraft,
): boolean {
  const title = normalizeWhitespace(after.title);
  if (!title) return false;

  const description = normalizeWhitespace(after.description ?? "");
  if (!description) return true;
  if (FORBIDDEN_HEADERS_RE.test(description)) return false;

  const itemsCount = countNumberedItems(description);
  if (itemsCount < 2) return false;

  const originalItems = roughOriginalItemsCount(`${originalText}\n${previousDescription ?? ""}`);
  return itemsCount <= originalItems + 2;
}

function deriveDeterministicDraft(params: NormalizeStructuredCreateTaskDescriptionParams): StructuredDraft {
  const currentTitle = normalizeWhitespace(params.title);
  const currentDescription = normalizeWhitespace(params.description ?? "");

  if (currentDescription && countNumberedItems(currentDescription) >= 2 && !FORBIDDEN_HEADERS_RE.test(currentDescription)) {
    return { title: currentTitle, description: currentDescription };
  }

  const sourceText = currentDescription || stripCommandPrefix(params.originalText);
  const allCandidates = splitIntoActionCandidates(sourceText);
  if (allCandidates.length < 2) {
    return { title: currentTitle, description: currentDescription || undefined };
  }

  const titleLower = currentTitle.toLowerCase();
  const actions = dedupePreserveOrder(
    allCandidates.filter((item) => {
      const lower = item.toLowerCase();
      return lower !== titleLower && !lower.startsWith(`${titleLower},`);
    }),
  );

  if (actions.length < 2) {
    return { title: currentTitle, description: currentDescription || undefined };
  }

  return { title: currentTitle, description: toNumbered(actions) };
}

export function shouldStructureCreateTaskDescription(
  params: ShouldStructureCreateTaskDescriptionParams,
): { should: boolean; reason: StructuredDescriptionReason } {
  const original = normalizeWhitespace(params.originalText);
  const description = normalizeWhitespace(params.description ?? "");
  if (original.length > 180) return { should: true, reason: "originalTextLength" };
  if (description.length > 120) return { should: true, reason: "descriptionLength" };
  if (ENUMERATION_RE.test(original) || ENUMERATION_RE.test(description)) {
    return { should: true, reason: "enumerationMarkers" };
  }
  return { should: false, reason: "none" };
}

function isValidAiPayload(parsed: unknown): parsed is { title: string; description?: string } {
  if (!parsed || typeof parsed !== "object") return false;
  const title = (parsed as { title?: unknown }).title;
  const description = (parsed as { description?: unknown }).description;
  if (typeof title !== "string" || !title.trim()) return false;
  return description === undefined || typeof description === "string";
}

const SYSTEM_PROMPT =
  "Ты нормализуешь только create_task title/description. " +
  "Это одна задача, не создавай отдельные задачи. " +
  "Title должен быть коротким общим результатом задачи. " +
  "Description должен быть только списком конкретных шагов, если в тексте есть 2+ действия. " +
  "Description должен быть plain text нумерованным списком: '1. ...' и '2. ...'. " +
  "Не добавляй заголовки 'План', 'Подзадачи', 'Чеклист'. " +
  "Не добавляй новых пунктов от себя. " +
  "Не удаляй имена, даты, суммы, отделы, важные объекты. " +
  "Не помещай фразу дедлайна в description, если deadlineDate уже есть. " +
  "Если списка действий нет, верни исходные title/description. " +
  "Верни только JSON {\"title\":\"...\",\"description\":\"...\"}.";

function buildUserPrompt(params: NormalizeStructuredCreateTaskDescriptionParams): string {
  return [
    "Input:",
    `originalText: \"${params.originalText}\"`,
    `currentTitle: \"${params.title}\"`,
    `currentDescription: \"${params.description ?? ""}\"`,
    `deadlineDate: \"${params.deadlineDate ?? ""}\"`,
    "Output JSON:",
    "{\"title\":\"...\",\"description\":\"1. ...\\n2. ...\"}",
  ].join("\n");
}

export async function normalizeStructuredCreateTaskDescription(
  params: NormalizeStructuredCreateTaskDescriptionParams,
): Promise<NormalizeStructuredCreateTaskDescriptionResult> {
  const currentTitle = normalizeWhitespace(params.title);
  const currentDescription = normalizeWhitespace(params.description ?? "");
  const trigger = shouldStructureCreateTaskDescription({
    originalText: params.originalText,
    title: currentTitle,
    description: currentDescription,
  });

  if (!trigger.should) {
    devLog("create-task-structured-description", {
      source: "create-task-structured-description",
      triggered: false,
      reason: trigger.reason,
      originalTextChars: params.originalText.length,
      descriptionChars: currentDescription.length,
      changed: false,
      itemsCount: countNumberedItems(currentDescription),
    });
    return { title: currentTitle, description: currentDescription || undefined, changed: false, source: "none" };
  }

  const deterministicDraft = deriveDeterministicDraft(params);
  const deterministicSafe = isSafeStructuredDescription(
    params.originalText,
    currentDescription || undefined,
    deterministicDraft,
  );

  let draft: StructuredDraft = deterministicSafe
    ? deterministicDraft
    : { title: currentTitle, description: currentDescription || undefined };
  let source: StructuredDescriptionSource = deterministicSafe ? "deterministic" : "fallback";

  if (getAiProviderState().enabled) {
    const ai = await requestAiJson({
      promptGroup: "create-task-structured-description",
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(params),
      userText: params.originalText,
      temperature: 0,
      maxTokens: 220,
      validate: isValidAiPayload,
    });

    if (ai.ok && isValidAiPayload(ai.parsed)) {
      const aiDraft: StructuredDraft = {
        title: sanitizeTitle(ai.parsed.title, currentTitle),
        description: normalizeWhitespace(ai.parsed.description ?? "") || undefined,
      };
      if (isSafeStructuredDescription(params.originalText, currentDescription || undefined, aiDraft)) {
        draft = aiDraft;
        source = "ai";
      }
    }
  }

  const finalTitle = sanitizeTitle(draft.title, currentTitle);
  const finalDescription = normalizeWhitespace(draft.description ?? "") || undefined;
  const changed = finalTitle !== currentTitle || (finalDescription ?? "") !== currentDescription;

  devLog("create-task-structured-description", {
    source: "create-task-structured-description",
    triggered: true,
    reason: trigger.reason,
    originalTextChars: params.originalText.length,
    descriptionChars: currentDescription.length,
    changed,
    itemsCount: countNumberedItems(finalDescription ?? ""),
    strategy: source,
  });

  return { title: finalTitle, description: finalDescription, changed, source };
}
