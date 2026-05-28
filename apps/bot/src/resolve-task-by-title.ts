import type { ApiTask, ApiUser } from "./api";
import { fetchProjects, fetchTasks } from "./api";
import { findTaskByTitle, resolveProjectFromHint } from "./hint-matchers";
import {
  apiTaskToCandidate,
  startPendingTaskSelection,
  type PendingTaskSelectionType,
  type TaskCandidate,
  type TaskSelectionPayload,
} from "./pending-task-selection";
import { formatTaskCandidates } from "./task-selection-format";
import { canModifyTask, type TaskStatusChangeTarget } from "./task-status-flow";
import { canReadTask } from "./task-read-access";

export type TaskResolvePurpose =
  | "complete"
  | "cancel"
  | "start"
  | "deadline"
  | "comment"
  | "comments_list"
  | "mention"
  | "transfer"
  | "reassign";

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
    case "comments_list":
      return "select_task_for_comments_list";
    case "mention":
      return "select_task_for_mention";
    case "transfer":
      return "select_task_for_transfer";
    case "reassign":
      return "select_task_for_reassign";
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
    if (purpose === "comments_list") return canReadTask(user, task);
    if (!canModifyTask(user, task)) return false;
    if (purpose === "comment" || purpose === "mention") return true;
    if (purpose === "transfer" || purpose === "reassign") {
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
  if (purpose === "comments_list") {
    return "Укажите название задачи, например: «Покажи комментарии по задаче склад».";
  }
  if (purpose === "mention") {
    return "Использование: /mention <сотрудник> | <задача> | <комментарий>";
  }
  if (purpose === "transfer") {
    return "Использование: /transfer <задача> | <новый исполнитель> | <комментарий>";
  }
  if (purpose === "reassign") {
    return "Использование: /reassign <задача> | <старый исполнитель?> | <новый исполнитель> | <комментарий>";
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
    assigneeFilterUserId?: string;
    assigneeFilterUserName?: string;
    projectHint?: string;
  },
): Promise<ResolveTaskByTitleResult> {
  const trimmed = titleQuery.trim();
  if (!trimmed) {
    return { kind: "empty", message: emptyTitleMessage(purpose) };
  }

  let projectId: string | undefined;
  const projectHintTrimmed = options?.projectHint?.trim();
  if (projectHintTrimmed) {
    const projects = await fetchProjects(user.id);
    const projectResult = resolveProjectFromHint(projects, projectHintTrimmed);
    if (projectResult.kind === "not_found" || projectResult.kind === "ambiguous") {
      return { kind: "empty", message: projectResult.message };
    }
    projectId = projectResult.project.id;
  }

  const tasks = await fetchTasks(user.id, projectId);
  const match = findTaskByTitle(tasks, trimmed);

  if (match.kind === "not_found") {
    return { kind: "not_found" };
  }

  const matchedTasks = match.kind === "found" ? [match.task] : match.tasks;
  let filtered = filterTasksForPurpose(matchedTasks, user, purpose);

  const assigneeFilterId = options?.assigneeFilterUserId;
  if (assigneeFilterId && purpose === "reassign") {
    filtered = filtered.filter((task) => task.assigneeId === assigneeFilterId);
    if (filtered.length === 0) {
      const fromName = options.assigneeFilterUserName ?? "сотрудника";
      return {
        kind: "no_modifiable",
        message: `Не нашёл активную задачу «${trimmed}» у сотрудника ${fromName}.`,
      };
    }
  }

  if (filtered.length === 0) {
    if (purpose === "comments_list") {
      return { kind: "not_found" };
    }
    if (matchedTasks.length === 1 && !canModifyTask(user, matchedTasks[0])) {
      return {
        kind: "cannot_modify",
        message:
          purpose === "comment" || purpose === "mention"
            ? "Вы не можете комментировать эту задачу."
            : purpose === "transfer"
              ? "Вы не можете передать эту задачу."
              : purpose === "reassign"
                ? "Вы не можете переназначить эту задачу."
                : "Вы не можете изменить эту задачу.",
      };
    }
    if (purpose === "comment" || purpose === "mention") {
      return { kind: "no_modifiable", message: "Вы не можете комментировать найденные задачи." };
    }
    if (purpose === "transfer") {
      return { kind: "no_modifiable", message: "Вы не можете передать найденные задачи." };
    }
    if (purpose === "reassign") {
      return { kind: "no_modifiable", message: "Не нашёл подходящих активных задач." };
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
