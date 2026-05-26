import {
  buildTaskAssigneeAssignedMessage,
  buildTaskAssigneeUnassignedMessage,
} from "./task-assignee-notify.util";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

export function devLogTaskAssigneeNotifySelfChecks(): void {
  const deadline = new Date(Date.UTC(2026, 4, 28, 23, 59, 59, 999));
  const assigned = buildTaskAssigneeAssignedMessage("Проверить склад", deadline);
  assert(assigned.includes("Вам назначена задача"), "assigned header");
  assert(assigned.includes("Проверить склад"), "assigned title");
  assert(assigned.includes("28.05.2026"), "assigned deadline ru");

  const unassigned = buildTaskAssigneeUnassignedMessage("Проверить склад");
  assert(unassigned.includes("больше не назначена"), "unassigned header");
  assert(unassigned.includes("Проверить склад"), "unassigned title");

  console.log("[task-assignee-notify] self-checks OK");
}
