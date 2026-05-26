import {
  buildTaskFieldsUpdatedNotifyMessage,
  normalizeTaskDescription,
  taskDescriptionsEqual,
} from "./task-fields-notify.util";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

export function devLogTaskFieldsNotifySelfChecks(): void {
  assert(normalizeTaskDescription("  ") === null, "empty description");
  assert(normalizeTaskDescription("x") === "x", "trim description");
  assert(taskDescriptionsEqual(null, ""), "null vs empty");
  assert(taskDescriptionsEqual(" a ", "a"), "trim equal");

  const titleOnly = buildTaskFieldsUpdatedNotifyMessage({
    taskTitle: "Новое",
    titleChanged: true,
    descriptionChanged: false,
    oldTitle: "Старое",
    newTitle: "Новое",
  });
  assert(titleOnly?.includes("Изменено название"), "title message");
  assert(titleOnly?.includes("Старое"), "old title");

  const descOnly = buildTaskFieldsUpdatedNotifyMessage({
    taskTitle: "Задача",
    titleChanged: false,
    descriptionChanged: true,
  });
  assert(descOnly?.includes("Изменено описание"), "desc message");

  const both = buildTaskFieldsUpdatedNotifyMessage({
    taskTitle: "Задача",
    titleChanged: true,
    descriptionChanged: true,
    oldTitle: "A",
    newTitle: "B",
  });
  assert(both?.includes("Задача обновлена"), "combined message");
  assert(both?.includes("название, описание"), "combined fields");

  console.log("[task-fields-notify] self-checks OK");
}
