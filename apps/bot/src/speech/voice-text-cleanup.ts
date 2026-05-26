import { requestAiJson } from "../yandex-gpt";

export type VoiceTextCleanupSource = "ai" | "none" | "fallback";

export type VoiceTextCleanupResult = {
  text: string;
  source: VoiceTextCleanupSource;
  changed: boolean;
};

export type CleanupRecognizedVoiceTextOptions = {
  mode?: "semantic" | "value";
  valueFieldKey?: string;
};

type IntentMarker = {
  key: string;
  equivalentKeys: string[];
  patterns: RegExp[];
};

function isValidPayload(parsed: unknown): parsed is { text: string } {
  if (!parsed || typeof parsed !== "object") return false;
  const v = (parsed as { text?: unknown }).text;
  return typeof v === "string";
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const SELF_ASSIGNEE_PATTERNS: RegExp[] = [
  /\bмне\b/iu,
  /\bна\s+меня\b/iu,
  /\bдля\s+меня\b/iu,
  /\bсебе\b/iu,
  /\bсам\s+себе\b/iu,
  /\bмоя\s+задач\w*/iu,
  /\bсозда[йм]\w*\s+мне\b/iu,
  /\bпостав\w*\s+мне\b/iu,
  /\bназнач\w*\s+на\s+меня\b/iu,
  /\bперекин\w*\s+на\s+меня\b/iu,
  /\bзапиш\w*\s+на\s+меня\b/iu,
];

const TASK_STATUS_ACTION_PATTERNS: RegExp[] = [
  /\bзакрой\s+задач\w*/iu,
  /\bзакрыть\s+задач\w*/iu,
  /\bотмени\s+задач\w*/iu,
  /\bотменить\s+задач\w*/iu,
  /\bзадача\s+сделан\w*/iu,
  /\bвыполнил\s+задач\w*/iu,
];

const TASK_STATUS_DETAIL_PATTERNS: RegExp[] = [
  /\bя\s+сделал\b/iu,
  /\bя\s+вс[её]\s+сделал\b/iu,
  /\bсделал\b/iu,
  /\bотправил\b/iu,
  /\bготово\b/iu,
  /\bпричин\w*/iu,
  /\bпотому\s+что\b/iu,
  /\bтак\s+как\b/iu,
];

export function containsSelfAssigneeMarker(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();
  return SELF_ASSIGNEE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function containsTaskStatusActionMarker(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();
  return TASK_STATUS_ACTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function containsTaskStatusDetailMarker(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();
  return TASK_STATUS_DETAIL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasInlineStatusSuffixSignal(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  return /[,:;]\s*\S+/u.test(normalized);
}

function isShortText(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return true;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length <= 2 && normalized.length <= 16) return true;
  if (/^[\d\s.,:/-]+$/u.test(normalized) && normalized.length <= 20) return true;
  return false;
}

const FILLER_PATTERNS: RegExp[] = [
  /\bну\b/giu,
  /\bкороче\b/giu,
  /\bтипа\b/giu,
  /\bэто\s+самое\b/giu,
  /\bкак\s+бы\b/giu,
  /\bзначит\b/giu,
  /\bв\s+общем\b/giu,
  /\bээ+\b/giu,
  /\bмм+\b/giu,
];

const INTENT_MARKERS: IntentMarker[] = [
  {
    key: "create_task",
    equivalentKeys: ["create_task"],
    patterns: [/\bсоздай\s+задач\w*/iu, /\bпоставь\s+задач\w*/iu, /\bназначь\s+задач\w*/iu],
  },
  {
    key: "create_note",
    equivalentKeys: ["create_note"],
    patterns: [/\bзапиш[иь]\s+замет\w*/iu, /\bсоздай\s+замет\w*/iu, /\bдобавь\s+замет\w*/iu],
  },
  {
    key: "create_expense",
    equivalentKeys: ["create_expense"],
    patterns: [/\bдобавь\s+расход\w*/iu, /\bпотратил\w*/iu, /\bоплатил\w*/iu],
  },
  {
    key: "add_comment",
    equivalentKeys: ["add_comment"],
    patterns: [/\bнапиш[иь]\s+комментар\w*/iu, /\bдобавь\s+комментар\w*/iu],
  },
  {
    key: "show_tasks",
    equivalentKeys: ["show_tasks"],
    patterns: [/\bпокажи\s+задач\w*/iu],
  },
  {
    key: "transfer_task",
    equivalentKeys: ["transfer_task", "reassign_task"],
    patterns: [/\bпередай\s+задач\w*/iu, /\bпереназначь\s+задач\w*/iu],
  },
  {
    key: "edit_task",
    equivalentKeys: ["edit_task"],
    patterns: [/\bизмени\s+описан\w*/iu, /\bизмени\s+дедлайн\w*/iu, /\bизмени\s+исполнител\w*/iu],
  },
  {
    key: "complete_task",
    equivalentKeys: ["complete_task"],
    patterns: [/\bзакрой\s+задач\w*/iu, /\bзакрыть\s+задач\w*/iu, /\bзадача\s+сделан\w*/iu, /\bвыполнил\s+задач\w*/iu],
  },
  {
    key: "cancel_task",
    equivalentKeys: ["cancel_task"],
    patterns: [/\bотмени\s+задач\w*/iu, /\bотменить\s+задач\w*/iu],
  },
  {
    key: "sick_leave",
    equivalentKeys: ["sick_leave"],
    patterns: [/\bя\s+заболел\w*/iu],
  },
  {
    key: "vacation",
    equivalentKeys: ["vacation"],
    patterns: [/\bдобавь\s+отпуск\w*/iu],
  },
];

function findIntentMarkerKeys(text: string): string[] {
  const normalized = normalizeWhitespace(text).toLowerCase();
  const found = new Set<string>();
  for (const marker of INTENT_MARKERS) {
    if (marker.patterns.some((pattern) => pattern.test(normalized))) {
      found.add(marker.key);
    }
  }
  return Array.from(found);
}

function hasEquivalentIntentMarker(text: string, markerKey: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();
  const marker = INTENT_MARKERS.find((item) => item.key === markerKey);
  if (!marker) return false;
  const equivalents = new Set(marker.equivalentKeys);
  for (const item of INTENT_MARKERS) {
    if (!equivalents.has(item.key)) continue;
    if (item.patterns.some((pattern) => pattern.test(normalized))) {
      return true;
    }
  }
  return false;
}

export function cleanupFillerWords(text: string): string {
  let next = text;
  for (const filler of FILLER_PATTERNS) {
    next = next.replace(filler, " ");
  }
  next = next.replace(/[,.!?;:]\s*([,.!?;:]\s*)+/g, ". ");
  next = next.replace(/\s{2,}/g, " ");
  next = next.replace(/\s+([,.;!?])/g, "$1");
  return normalizeWhitespace(next);
}

export function ensureIntentMarkerPreserved(original: string, cleaned: string): string {
  const originalMarkers = findIntentMarkerKeys(original);
  if (originalMarkers.length === 0) return cleaned;
  const allPreserved = originalMarkers.every((key) => hasEquivalentIntentMarker(cleaned, key));
  return allPreserved ? cleaned : original;
}

function shouldUseAiCleanup(
  text: string,
  options?: CleanupRecognizedVoiceTextOptions,
): boolean {
  if (isShortText(text)) return false;
  if (!options || options.mode === "semantic") return true;
  if (options.mode === "value") {
    const fieldKey = (options.valueFieldKey ?? "").trim();
    if (!fieldKey) return false;
    if (fieldKey === "description" || fieldKey === "commentText" || fieldKey === "title" || fieldKey === "text") {
      return true;
    }
    return false;
  }
  return false;
}

const SYSTEM_PROMPT =
  "Ты очищаешь распознанный голосовой текст для бизнес-бота. " +
  "Удали только слова-паразиты, очевидные повторы и мусор распознавания. " +
  "Не удаляй и не переформулируй intent команды. " +
  "Если пользователь сказал 'запиши заметку', 'создай задачу', 'добавь расход', 'напиши комментарий' и т.п., сохрани этот intent явно. " +
  "Никогда не удаляй маркеры назначения на себя: 'мне', 'на меня', 'для меня', 'себе', 'сам себе'. " +
  "Эти слова определяют исполнителя задачи и должны быть сохранены буквально по смыслу. " +
  "Сохрани смысл, имена, даты, суммы, числа, названия задач и тип команды. " +
  "Сохраняй перечисления и границы шагов (первое/второе, 1./2., отдельные пункты), не склеивай все в один абзац. " +
  "Сохрани назначение задачи (кто исполнитель) без изменений. " +
  "Если команда про закрытие/отмену задачи содержит результат или причину, не удаляй эту часть. " +
  "Текст вида 'Закрой задачу, я всё сделал...' должен сохранить и команду, и результат. " +
  "Не добавляй новых фактов. Верни command-like текст, а не только контент. " +
  "Верни только JSON {\"text\":\"...\"}.";

function buildUserPrompt(text: string): string {
  return [
    "Input:",
    `\"${text}\"`,
    "Output JSON:",
    "{\"text\":\"...\"}",
  ].join("\n");
}

export async function cleanupRecognizedVoiceText(
  text: string,
  options?: CleanupRecognizedVoiceTextOptions,
): Promise<VoiceTextCleanupResult> {
  const original = normalizeWhitespace(text);
  if (!original) {
    return { text: "", source: "none", changed: false };
  }

  const deterministic = cleanupFillerWords(original);
  const deterministicSafe = ensureIntentMarkerPreserved(original, deterministic);
  const originalHasSelfMarker = containsSelfAssigneeMarker(original);
  const originalHasStatusAction = containsTaskStatusActionMarker(original);
  const originalHasStatusDetail =
    containsTaskStatusDetailMarker(original) || (originalHasStatusAction && hasInlineStatusSuffixSignal(original));

  if (!shouldUseAiCleanup(original, options)) {
    return {
      text: deterministicSafe,
      source: "none",
      changed: deterministicSafe !== original,
    };
  }

  try {
    const result = await requestAiJson({
      promptGroup: "voice-text-cleanup",
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(original),
      userText: original,
      temperature: 0,
      maxTokens: 140,
      validate: isValidPayload,
    });

    if (!result.ok || !isValidPayload(result.parsed)) {
      return {
        text: deterministicSafe,
        source: "fallback",
        changed: deterministicSafe !== original,
      };
    }

    const cleaned = normalizeWhitespace(result.parsed.text);
    if (!cleaned) {
      return {
        text: deterministicSafe,
        source: "fallback",
        changed: deterministicSafe !== original,
      };
    }

    const intentSafe = ensureIntentMarkerPreserved(original, cleaned);
    const cleanedHasSelfMarker = containsSelfAssigneeMarker(cleaned);
    if (originalHasSelfMarker && !cleanedHasSelfMarker) {
      console.info("[voice] voice-cleanup-self-marker-fallback", {
        source: "voice-cleanup-self-marker-fallback",
        originalHasSelfMarker: true,
        cleanedHasSelfMarker: false,
        originalChars: original.length,
        cleanedChars: cleaned.length,
      });
      return {
        text: original,
        source: "fallback",
        changed: false,
      };
    }

    const cleanedHasStatusAction = containsTaskStatusActionMarker(cleaned);
    const cleanedHasStatusDetail =
      containsTaskStatusDetailMarker(cleaned) || (cleanedHasStatusAction && hasInlineStatusSuffixSignal(cleaned));
    if (originalHasStatusAction && originalHasStatusDetail && (!cleanedHasStatusAction || !cleanedHasStatusDetail)) {
      console.info("[voice] voice-cleanup-task-status-detail-fallback", {
        source: "voice-cleanup-task-status-detail-fallback",
        originalHasStatusAction,
        originalHasStatusDetail,
        cleanedHasStatusAction,
        cleanedHasStatusDetail,
        originalChars: original.length,
        cleanedChars: cleaned.length,
      });
      return {
        text: original,
        source: "fallback",
        changed: false,
      };
    }

    const safeText = intentSafe === original ? deterministicSafe : intentSafe;

    return {
      text: safeText || original,
      source: "ai",
      changed: (safeText || original) !== original,
    };
  } catch {
    return {
      text: deterministicSafe,
      source: "fallback",
      changed: deterministicSafe !== original,
    };
  }
}
