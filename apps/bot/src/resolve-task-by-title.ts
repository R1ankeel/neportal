import type { ApiTask, ApiUser } from "./api";
import { fetchTasks } from "./api";
import { findTaskByTitle } from "./hint-matchers";
import {
  apiTaskToCandidate,
  startPendingTaskSelection,
  type PendingTaskSelectionType,
  type TaskCandidate,
  type TaskSelectionPayload,
} from "./pending-task-selection";
import { formatTaskCandidates } from "./task-selection-format";
import { canModifyTask, type TaskStatusChangeTarget } from "./task-status-flow";

export type TaskResolvePurpose =
  | "complete"
  | "cancel"
  | "start"
  | "deadline"
  | "comment"
  | "mention"
  | "transfer";

export type ResolveTaskByTitleResult =
  | { kind: "found"; task: ApiTask }
  | { kind: "not_found" }
  | { kind: "no_modifiable"; message: string }
  | { kind: "cannot_modify"; message: string }
  | { kind: "already_closed"; message: string }
  | { kind: "already_cancelled"; message: string }
  | { kind: "already_in_progress"; message: string }
  | { kind: "already_done"; message: string }
  | { kind: "selection_started"; message: string }
  | { kind: "empty"; message: string };

export function purposeToSelectionType(purpose: TaskResolvePurpose): PendingTaskSelectionType {
  switch (purpose) {
    case "complete":
      return "select_task_for_complete";
    case "cancel":
      return "select_task_for_cancel";
    case "start":
      return "select_task_for_start";
    case "deadline":
      return "select_task_for_deadline";
    case "comment":
      return "select_task_for_comment";
    case "mention":
      return "select_task_for_mention";
    case "transfer":
      return "select_task_for_transfer";
  }
}

export function purposeFromStatusTarget(target: TaskStatusChangeTarget): TaskResolvePurpose {
  return target === "DONE" ? "complete" : "cancel";
}

function filterTasksForPurpose(
  tasks: ApiTask[],
  user: ApiUser,
  purpose: TaskResolvePurpose,
): ApiTask[] {
  return tasks.filter((task) => {
    if (!canModifyTask(user, task)) return false;
    if (purpose === "comment" || purpose === "mention") return true;
    if (purpose === "transfer") {
      return task.status === "NEW" || task.status === "IN_PROGRESS";
    }
    if (purpose === "start") {
      return task.status === "NEW";
    }
    if (purpose === "complete" || purpose === "cancel") {
      return task.status !== "DONE" && task.status !== "CANCELLED";
    }
    return task.status === "NEW" || task.status === "IN_PROGRESS";
  });
}

function emptyTitleMessage(purpose: TaskResolvePurpose): string {
  if (purpose === "complete") return "Укажите название: /done Проверить склад";
  if (purpose === "cancel") return "Укажите название: /cancel Проверить склад";
  if (purpose === "start") return "Укажите название: /start-task Проверить склад";
  if (purpose === "comment") {
    return "Использование: /comment <задача> — <комментарий>";
  }
  if (purpose === "mention") {
    return "Использование: /mention <сотрудник> | <задача> | <комментарий>";
  }
  if (purpose === "transfer") {
    return "Использование: /transfer <задача> | <новый исполнитель> | <комментарий>";
  }
  return "Укажите название задачи.";
}

function noModifiableMessage(
  matchedTasks: ApiTask[],
  purpose: TaskResolvePurpose,
): ResolveTaskByTitleResult {
  if (purpose === "start") {
    if (matchedTasks.some((t) => t.status === "IN_PROGRESS")) {
      return {
        kind: "already_in_progress",
        message: `Задача уже в работе: ${matchedTasks[0].title}`,
      };
    }
    if (matchedTasks.some((t) => t.status === "DONE")) {
      return {
        kind: "already_done",
        message: `Задача уже выполнена: ${matchedTasks[0].title}`,
      };
    }
    if (matchedTasks.some((t) => t.status === "CANCELLED")) {
      return {
        kind: "already_cancelled",
        message: `Задача отменена: ${matchedTasks[0].title}`,
      };
    }
  }
  if (purpose === "complete" && matchedTasks.some((t) => t.status === "DONE")) {
    return {
      kind: "already_closed",
      message: `Задача уже закрыта: ${matchedTasks[0].title}`,
    };
  }
  if (purpose === "cancel" && matchedTasks.some((t) => t.status === "CANCELLED")) {
    return {
      kind: "already_cancelled",
      message: `Задача уже отменена: ${matchedTasks[0].title}`,
    };
  }
  return {
    kind: "no_modifiable",
    message: "Вы не можете изменить найденные задачи.",
  };
}

/** Поиск задачи: exact → includes; при нескольких подходящих — selection flow. */
export async function resolveTaskByTitle(
  user: ApiUser,
  titleQuery: string,
  purpose: TaskResolvePurpose,
  options?: {
    telegramUserId?: number;
    selectionPayload?: TaskSelectionPayload;
  },
): Promise<ResolveTaskByTitleResult> {
  const trimmed = titleQuery.trim();
  if (!trimmed) {
    return { kind: "empty", message: emptyTitleMessage(purpose) };
  }

  const tasks = await fetchTasks();
  const match = findTaskByTitle(tasks, trimmed);

  if (match.kind === "not_found") {
    return { kind: "not_found" };
  }

  const matchedTasks = match.kind === "found" ? [match.task] : match.tasks;
  const filtered = filterTasksForPurpose(matchedTasks, user, purpose);

  if (filtered.length === 0) {
    if (matchedTasks.length === 1 && !canModifyTask(user, matchedTasks[0])) {
      return {
        kind: "cannot_modify",
        message:
          purpose === "comment" || purpose === "mention"
            ? "Вы не можете комментировать эту задачу."
            : purpose === "transfer"
              ? "Вы не можете передать эту задачу."
              : "Вы не можете изменить эту задачу.",
      };
    }
    if (purpose === "comment" || purpose === "mention") {
      return { kind: "no_modifiable", message: "Вы не можете комментировать найденные задачи." };
    }
    if (purpose === "transfer") {
      return { kind: "no_modifiable", message: "Вы не можете передать найденные задачи." };
    }
    return noModifiableMessage(matchedTasks, purpose);
  }

  if (filtered.length === 1) {
    return { kind: "found", task: filtered[0] };
  }

  const telegramUserId = options?.telegramUserId;
  if (telegramUserId == null) {
    return {
      kind: "no_modifiable",
      message: "Найдено несколько задач. Уточните название.",
    };
  }

  const candidates: TaskCandidate[] = filtered.map(apiTaskToCandidate);
  startPendingTaskSelection(
    telegramUserId,
    purposeToSelectionType(purpose),
    candidates,
    options?.selectionPayload ?? {},
  );

  return {
    kind: "selection_started",
    message: formatTaskCandidates(candidates),
  };
}

export function resolveResultToMessage(result: ResolveTaskByTitleResult): string {
  switch (result.kind) {
    case "found":
      return "";
    case "not_found":
      return "Задача не найдена.";
    case "empty":
    case "no_modifiable":
    case "cannot_modify":
    case "already_closed":
    case "already_cancelled":
    case "already_in_progress":
    case "already_done":
    case "selection_started":
      return result.message;
  }
}
