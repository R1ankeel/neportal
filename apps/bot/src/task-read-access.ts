import type { ApiTask, ApiUser } from "./api";

/**
 * Право на чтение задачи (просмотр, список, комментарии).
 *
 * Текущее правило: любой привязанный сотрудник организации может читать
 * любую задачу своей организации. Организационная принадлежность уже
 * гарантируется на уровне API (все запросы фильтруются по organizationId).
 *
 * TODO: При появлении проектной видимости добавить проверку:
 *   task.projectId != null && user.projectIds.includes(task.projectId)
 */
export function canReadTask(_user: ApiUser, _task: ApiTask): boolean {
  return true;
}

/**
 * Право смотреть задачи другого сотрудника организации.
 *
 * Текущее правило: разрешено всем привязанным сотрудникам.
 *
 * TODO: При появлении проектной видимости ограничить —
 * viewer может запрашивать задачи target, только если оба
 * состоят в общем проекте.
 */
export function canViewOtherMemberTasks(_viewer: ApiUser): boolean {
  return true;
}
