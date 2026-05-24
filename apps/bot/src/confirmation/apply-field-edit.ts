import type { AiIntent } from "../ai-contracts";
import { parseAmount } from "../api";
import { cleanupTaskTitleWithAi } from "../ai/cleanup-task-title";
import { findProjectByHint } from "../hint-matchers";
import {
  coerceDeadlineDateLoose,
  parseRuDate,
  resolveDeadlineFromUserMessage,
  todayIsoDate,
} from "../parse-ru-date";
import { parseBudgetReceiptEdit } from "../parse-budget-receipt-edit";
import { isSelfHint, SELF_HINT_MARKER } from "../resolve-users-by-hint";
import { fetchProjects } from "../api";

export type ApplyFieldEditResult =
  | { ok: true; intent: AiIntent }
  | { ok: false; message: string };

function isClearText(value: string): boolean {
  return /^(?:пусто|очистить|убрать)$/iu.test(value.trim());
}

function isClearDeadline(value: string): boolean {
  return /^(?:без\s+дедлайна|убрать\s+дедлайн)$/iu.test(value.trim());
}

function normalizeUserHint(value: string): string {
  const t = value.trim();
  if (t === SELF_HINT_MARKER || isSelfHint(t)) return SELF_HINT_MARKER;
  return t;
}

function parseDateEditValue(value: string): string | null {
  const iso = parseRuDate(value);
  if (iso) return iso;
  return resolveDeadlineFromUserMessage(value, todayIsoDate());
}

function parseAmountFromText(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const match = normalized.match(/[\d.]+/);
  if (!match) return null;
  const amount = parseAmount(match[0]);
  return amount > 0 ? amount : null;
}

export async function applyFieldEdit(
  intent: AiIntent,
  fieldKey: string,
  rawValue: string,
): Promise<ApplyFieldEditResult> {
  const value = rawValue.trim();
  if (!value) {
    return { ok: false, message: "Введите значение." };
  }

  switch (fieldKey) {
    case "text": {
      if (intent.intent === "create_note") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, text: value } } };
      }
      break;
    }

    case "commentText": {
      if (intent.intent === "add_task_comment") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, text: value } } };
      }
      if (intent.intent === "mention_in_task") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, text: value } } };
      }
      break;
    }

    case "taskTitle": {
      switch (intent.intent) {
        case "add_task_comment":
          return {
            ok: true,
            intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
          };
        case "mention_in_task":
          return {
            ok: true,
            intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
          };
        case "complete_task":
          return {
            ok: true,
            intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
          };
        case "cancel_task":
          return {
            ok: true,
            intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
          };
        case "transfer_task":
          return {
            ok: true,
            intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
          };
        case "reassign_task":
          return {
            ok: true,
            intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
          };
        case "set_task_deadline":
          return {
            ok: true,
            intent: { ...intent, payload: { ...intent.payload, taskTitle: value } },
          };
        default:
          break;
      }
      break;
    }

    case "title": {
      if (intent.intent === "create_task") {
        let title = value;
        try {
          title = await cleanupTaskTitleWithAi(value);
        } catch {
          /* keep raw title */
        }
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, title } } };
      }
      break;
    }

    case "description": {
      if (intent.intent === "create_task") {
        const description = isClearText(value) ? undefined : value;
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, description } },
        };
      }
      if (intent.intent === "create_expense") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, description: value } },
        };
      }
      break;
    }

    case "assignee": {
      if (intent.intent === "create_task") {
        return {
          ok: true,
          intent: {
            ...intent,
            payload: {
              ...intent.payload,
              assigneeHint: normalizeUserHint(value),
              assigneeUserId: undefined,
            },
          },
        };
      }
      break;
    }

    case "deadline": {
      if (intent.intent === "create_task") {
        if (isClearDeadline(value)) {
          return {
            ok: true,
            intent: { ...intent, payload: { ...intent.payload, deadlineDate: undefined } },
          };
        }
        const deadlineDate =
          parseDateEditValue(value) ?? coerceDeadlineDateLoose(value, todayIsoDate());
        if (!deadlineDate) {
          return { ok: false, message: "Не удалось разобрать дату. Пример: завтра, пятница, 25.05.2026" };
        }
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, deadlineDate } },
        };
      }
      if (intent.intent === "set_task_deadline") {
        const deadlineDate =
          parseDateEditValue(value) ?? coerceDeadlineDateLoose(value, todayIsoDate());
        if (!deadlineDate) {
          return { ok: false, message: "Не удалось разобрать дату. Пример: 25.05.2026" };
        }
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, deadlineDate } },
        };
      }
      break;
    }

    case "user": {
      if (intent.intent === "create_absence") {
        return {
          ok: true,
          intent: {
            ...intent,
            payload: {
              ...intent.payload,
              userHint: normalizeUserHint(value),
              userId: undefined,
            },
          },
        };
      }
      if (intent.intent === "mention_in_task") {
        return {
          ok: true,
          intent: {
            ...intent,
            payload: { ...intent.payload, userHint: value, mentionedUserId: undefined },
          },
        };
      }
      break;
    }

    case "toUser": {
      if (intent.intent === "transfer_task") {
        return {
          ok: true,
          intent: {
            ...intent,
            payload: { ...intent.payload, toUserHint: value, toUserId: undefined },
          },
        };
      }
      if (intent.intent === "reassign_task") {
        return {
          ok: true,
          intent: {
            ...intent,
            payload: { ...intent.payload, toUserHint: value, toUserId: undefined },
          },
        };
      }
      break;
    }

    case "fromUser": {
      if (intent.intent === "reassign_task") {
        return {
          ok: true,
          intent: {
            ...intent,
            payload: { ...intent.payload, fromUserHint: value, fromUserId: undefined },
          },
        };
      }
      break;
    }

    case "startDate": {
      if (intent.intent === "create_absence") {
        const startDate = parseDateEditValue(value);
        if (!startDate) {
          return { ok: false, message: "Не удалось разобрать дату начала. Пример: 20.05.2026" };
        }
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, startDate } } };
      }
      break;
    }

    case "endDate": {
      if (intent.intent === "create_absence") {
        const endDate = parseDateEditValue(value);
        if (!endDate) {
          return {
            ok: false,
            message: "Не удалось разобрать дату окончания. Пример: пятница, 25.05.2026",
          };
        }
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, endDate } } };
      }
      break;
    }

    case "documentNumber": {
      if (intent.intent === "create_absence") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, documentNumber: value } },
        };
      }
      break;
    }

    case "comment": {
      if (intent.intent === "create_absence") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, comment: value } } };
      }
      if (intent.intent === "transfer_task" || intent.intent === "reassign_task") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, comment: value } } };
      }
      break;
    }

    case "amount": {
      const amount = parseAmountFromText(value);
      if (amount === null) {
        return { ok: false, message: "Укажите положительную сумму." };
      }
      if (intent.intent === "create_expense") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, amount } } };
      }
      if (intent.intent === "create_budget") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, amount } } };
      }
      break;
    }

    case "name": {
      if (intent.intent === "create_budget") {
        return { ok: true, intent: { ...intent, payload: { ...intent.payload, name: value } } };
      }
      break;
    }

    case "requiresReceipt": {
      if (intent.intent === "create_budget") {
        const receipt = parseBudgetReceiptEdit(value) ?? parseBudgetReceiptEdit(`чек ${value}`);
        if (receipt === null) {
          return { ok: false, message: "Напишите «да» или «нет», например: нужен чек / без чека." };
        }
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, requiresReceipt: receipt } },
        };
      }
      break;
    }

    case "matchingKeywords": {
      if (intent.intent === "create_budget") {
        const matchingKeywords = isClearText(value) ? undefined : value;
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, matchingKeywords } },
        };
      }
      break;
    }

    case "budget": {
      if (intent.intent === "create_expense") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, budgetHint: value } },
        };
      }
      break;
    }

    case "project": {
      const projects = await fetchProjects();
      const project = findProjectByHint(projects, value);
      if (!project) {
        return { ok: false, message: "Проект не найден. Укажите название из списка проектов." };
      }
      switch (intent.intent) {
        case "create_task":
          return {
            ok: true,
            intent: { ...intent, payload: { ...intent.payload, projectHint: project.name } },
          };
        case "create_expense":
          return {
            ok: true,
            intent: { ...intent, payload: { ...intent.payload, projectHint: project.name } },
          };
        case "create_budget":
          return {
            ok: true,
            intent: { ...intent, payload: { ...intent.payload, projectHint: project.name } },
          };
        default:
          return { ok: false, message: "Редактирование проекта пока не поддержано." };
      }
    }

    case "completionResult": {
      if (intent.intent === "complete_task") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, completionResult: value } },
        };
      }
      break;
    }

    case "cancellationReason": {
      if (intent.intent === "cancel_task") {
        return {
          ok: true,
          intent: { ...intent, payload: { ...intent.payload, cancellationReason: value } },
        };
      }
      break;
    }

    default:
      break;
  }

  return { ok: false, message: "Это поле пока нельзя изменить." };
}
