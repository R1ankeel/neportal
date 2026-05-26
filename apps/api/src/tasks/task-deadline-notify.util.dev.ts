import {
  buildTaskDeadlineChangedMessage,
  calendarDateKey,
  deadlineChangeKind,
} from "./task-deadline-notify.util";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

export function devLogTaskDeadlineNotifySelfChecks(): void {
  const d1 = new Date(Date.UTC(2026, 4, 27, 23, 59, 59, 999));
  const d2 = new Date(Date.UTC(2026, 4, 28, 23, 59, 59, 999));

  assert(calendarDateKey(d1) === "2026-05-27", "calendarDateKey d1");
  assert(calendarDateKey(d2) === "2026-05-28", "calendarDateKey d2");
  assert(calendarDateKey(null) === null, "calendarDateKey null");
  assert(deadlineChangeKind(null, "2026-05-28") === "set", "null -> date");
  assert(deadlineChangeKind("2026-05-27", "2026-05-28") === "changed", "date change");
  assert(deadlineChangeKind("2026-05-28", "2026-05-28") === null, "same date");
  assert(deadlineChangeKind("2026-05-28", null) === "cleared", "cleared");

  const msg = buildTaskDeadlineChangedMessage("Проверить склад", "2026-05-27", "2026-05-28");
  assert(msg?.includes("Изменён"), "changed message");
  assert(msg?.includes("27.05.2026"), "old ru date");
  assert(msg?.includes("28.05.2026"), "new ru date");

  console.log("[task-deadline-notify] self-checks OK");
}
