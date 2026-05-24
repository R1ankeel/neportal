import type { ApiUser } from "./api";
import { resolveUsersByHint } from "./resolve-users-by-hint";

export type ParsedTransferParts = {
  taskTitleNorm: string;
  toUserNorm: string;
  fromUserNorm?: string;
  toSelf?: boolean;
};

export type PeelTransferCommentResult = {
  commandText: string;
  comment?: string;
};

const TRANSFER_VERB_RE =
  /^(?:передай|перекинь|перенеси|переназначь|переведи|забери|назначь)(?:те)?(?:\s|$)/iu;

function transferDevLog(message: string, data?: Record<string, unknown>): void {
  if (process.env.BOT_DEV_LOG === "0") return;
  if (data && Object.keys(data).length > 0) {
    console.log(`[transfer-parser] ${message}`, data);
  } else {
    console.log(`[transfer-parser] ${message}`);
  }
}

export function isTransferLikeCommand(text: string): boolean {
  return TRANSFER_VERB_RE.test(text.trim());
}

/** Отделяет причину/комментарий: запятая, «потому что», «так как», «из-за». */
export function peelTransferTrailingComment(text: string): PeelTransferCommentResult {
  const trimmed = text.trim();
  if (!trimmed) return { commandText: trimmed };

  const because = trimmed.match(/\s+(?:потому\s+что|так\s+как|из-за)\s+(.+)$/iu);
  if (because?.[1] != null && because.index !== undefined) {
    return {
      commandText: trimmed.slice(0, because.index).trim(),
      comment: because[1].trim(),
    };
  }

  const comma = trimmed.indexOf(",");
  if (comma > 0) {
    const before = trimmed.slice(0, comma).trim();
    const after = trimmed.slice(comma + 1).trim();
    if (after && isTransferLikeCommand(before)) {
      return { commandText: before, comment: after };
    }
  }

  return { commandText: trimmed };
}

function normalizeTransferInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

/**
 * Хвост команды: отделяем 1–3 последних токена как toUserHint, если resolver уверен.
 */
export function trySplitTaskAndUserWithResolver(
  tail: string,
  users: ApiUser[],
  currentUser: ApiUser | null,
  logContext?: { raw?: string },
): ParsedTransferParts | null {
  const trimmedTail = tail.trim();
  if (!trimmedTail) {
    transferDevLog("skip empty tail", logContext);
    return null;
  }

  let taskPart = trimmedTail;
  if (/^по\s+/iu.test(taskPart)) {
    taskPart = taskPart.replace(/^по\s+/iu, "").trim();
  }

  const words = taskPart.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    transferDevLog("skip: need task + user tokens", {
      ...logContext,
      taskCandidate: taskPart,
    });
    return null;
  }

  for (let take = 3; take >= 1; take--) {
    if (words.length <= take) continue;
    const userCandidate = words.slice(-take).join(" ");
    const taskCandidate = words.slice(0, -take).join(" ");
    if (!taskCandidate.trim() || !userCandidate.trim()) continue;

    const resolved = resolveUsersByHint(users, userCandidate, currentUser);
    transferDevLog("try user split", {
      ...logContext,
      taskCandidate,
      userCandidate,
      resolvedKind: resolved.kind,
    });

    if (resolved.kind === "one") {
      transferDevLog("accepted", {
        ...logContext,
        taskCandidate,
        userCandidate,
        resolvedUser: resolved.user.fullName,
      });
      return {
        taskTitleNorm: taskCandidate.trim(),
        toUserNorm: userCandidate.trim(),
      };
    }
  }

  transferDevLog("rejected: no confident user match", {
    ...logContext,
    taskCandidate: taskPart,
  });
  return null;
}

const TRANSFER_TASK_PREFIX_RE =
  /^(?:передай|перекинь|перенеси|переназначь)(?:те)?\s+задачу\s+/iu;

const REASSIGN_FROM_TO_RE =
  /^(?:перекинь|перенеси|переназначь)(?:те)?\s+задачу\s+(.+?)\s+с\s+(\p{L}+(?:\s+\p{L}+)?)\s+на\s+(\p{L}+(?:\s+\p{L}+)?)$/iu;

const TASK_ON_USER_RE =
  /^(?:перекинь|перенеси|переназначь|передай)(?:те)?\s+задачу\s+(.+?)\s+на\s+(\p{L}+)$/iu;

const SELF_TO_PATTERNS: RegExp[] = [
  /^(?:передай|перекинь|перенеси|переназначь|забери|назначь)(?:те)?\s+мне\s+задачу\s+(.+)$/iu,
  /^(?:передай|перекинь|перенеси|переназначь|забери|назначь)(?:те)?\s+задачу\s+мне\s+(.+)$/iu,
  /^(?:переведи|перекинь|перенеси|переназначь)(?:те)?\s+на\s+меня\s+(.+)$/iu,
  /^(?:переведи|перекинь|перенеси|переназначь)(?:те)?\s+задачу\s+на\s+меня\s+(.+)$/iu,
];

const BARE_ON_USER_PREFIX_RE =
  /^(?:перекинь|перенеси|переназначь|передай)(?:те)?\s+/iu;

function tryParseBareOnUser(
  trimmed: string,
  users: ApiUser[],
  currentUser: ApiUser | null,
): ParsedTransferParts | null {
  const prefix = trimmed.match(BARE_ON_USER_PREFIX_RE);
  if (!prefix) return null;

  const tail = trimmed.slice(prefix[0].length).trim();
  const onParts = tail.match(/^(.+?)\s+на\s+(\p{L}+(?:\s+\p{L}+)?)$/iu);
  if (!onParts?.[1] || !onParts[2]) return null;

  const taskCandidate = onParts[1].trim();
  const userCandidate = onParts[2].trim();
  const resolved = resolveUsersByHint(users, userCandidate, currentUser);
  transferDevLog("bare на-user", {
    raw: trimmed,
    taskCandidate,
    userCandidate,
    resolvedKind: resolved.kind,
  });

  if (resolved.kind !== "one") return null;

  return {
    taskTitleNorm: taskCandidate,
    toUserNorm: userCandidate,
  };
}

function matchSelfTransfer(normalized: string): ParsedTransferParts | null {
  for (const re of SELF_TO_PATTERNS) {
    const m = normalized.match(re);
    if (m?.[1]) {
      return { taskTitleNorm: m[1].trim(), toSelf: true, toUserNorm: "" };
    }
  }

  const onUser = normalized.match(TASK_ON_USER_RE);
  if (onUser?.[1] && onUser[2]) {
    const toNorm = onUser[2].trim();
    if (toNorm === "меня" || toNorm === "мне") {
      return { taskTitleNorm: onUser[1].trim(), toSelf: true, toUserNorm: "" };
    }
  }

  return null;
}

function matchFromToReassign(
  normalized: string,
  users: ApiUser[],
  currentUser: ApiUser | null,
): ParsedTransferParts | null {
  const fromTo = normalized.match(REASSIGN_FROM_TO_RE);
  if (!fromTo?.[1] || !fromTo[2] || !fromTo[3]) return null;

  const toResolved = resolveUsersByHint(users, fromTo[3].trim(), currentUser);
  const fromResolved = resolveUsersByHint(users, fromTo[2].trim(), currentUser);
  if (toResolved.kind !== "one" || fromResolved.kind !== "one") {
    transferDevLog("rejected from-to: user not resolved", {
      from: fromTo[2],
      to: fromTo[3],
      fromKind: fromResolved.kind,
      toKind: toResolved.kind,
    });
    return null;
  }

  return {
    taskTitleNorm: fromTo[1].trim(),
    fromUserNorm: fromTo[2].trim(),
    toUserNorm: fromTo[3].trim(),
  };
}

function matchTaskOnUserWithResolver(
  trimmed: string,
  normalized: string,
  users: ApiUser[],
  currentUser: ApiUser | null,
): ParsedTransferParts | null {
  const onUser = normalized.match(TASK_ON_USER_RE);
  if (onUser?.[1] && onUser[2]) {
    const userCandidate = onUser[2].trim();
    const resolved = resolveUsersByHint(users, userCandidate, currentUser);
    transferDevLog("task на-user", {
      raw: trimmed,
      taskCandidate: onUser[1].trim(),
      userCandidate,
      resolvedKind: resolved.kind,
    });
    if (resolved.kind === "one") {
      return {
        taskTitleNorm: onUser[1].trim(),
        toUserNorm: userCandidate,
      };
    }
  }

  const prefix = trimmed.match(TRANSFER_TASK_PREFIX_RE);
  if (prefix) {
    const tail = trimmed.slice(prefix[0].length).trim();
    const fromResolver = trySplitTaskAndUserWithResolver(tail, users, currentUser, {
      raw: trimmed,
    });
    if (fromResolver) return fromResolver;
  }

  return tryParseBareOnUser(trimmed, users, currentUser);
}

export type DeterministicTransferParseOptions = {
  users: ApiUser[];
  currentUser?: ApiUser | null;
};

/**
 * Детерминированный разбор transfer/reassign до LLM.
 * С users — только уверенный split; иначе null (LLM).
 */
export function deterministicParseTransferCommand(
  text: string,
  options: DeterministicTransferParseOptions,
): { parts: ParsedTransferParts; comment?: string } | null {
  const { commandText, comment } = peelTransferTrailingComment(text);
  const trimmed = commandText.trim();
  if (!trimmed) return null;

  transferDevLog("raw", { raw: text.trim(), commandText: trimmed, reason: comment });

  const normalized = normalizeTransferInput(trimmed);
  const { users, currentUser = null } = options;

  const self = matchSelfTransfer(normalized);
  if (self?.taskTitleNorm) {
    return { parts: self, comment };
  }

  if (REASSIGN_FROM_TO_RE.test(normalized)) {
    const fromTo = matchFromToReassign(normalized, users, currentUser);
    if (fromTo) {
      return { parts: fromTo, comment };
    }
    transferDevLog("rejected: from-to pattern without confident users", { commandText: trimmed });
    return null;
  }

  const matched = matchTaskOnUserWithResolver(trimmed, normalized, users, currentUser);
  if (matched?.taskTitleNorm && (matched.toSelf || matched.toUserNorm)) {
    return { parts: matched, comment };
  }

  transferDevLog("no deterministic match", { commandText: trimmed });
  return null;
}
