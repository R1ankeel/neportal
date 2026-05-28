import type { ApiMyTask } from "./api";
import { MY_TASKS_LIST_MAX_LIMIT } from "./api";
import { formatGroupedTasksList, TASK_LIST_TRUNCATED_FOOTER } from "./my-tasks-flow";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function task(
  id: string,
  title: string,
  project: { id: string; name: string },
  status: "NEW" | "IN_PROGRESS" = "NEW",
): ApiMyTask {
  return {
    id,
    title,
    status,
    deadlineAt: null,
    creatorId: "u1",
    assigneeId: "u1",
    project,
  };
}

export function devLogMyTasksFlowChecks(): void {
  const tasks: ApiMyTask[] = [
    task("1", "B task", { id: "pb", name: "Бета" }),
    task("2", "A task", { id: "pa", name: "Альфа" }),
    task("3", "A2", { id: "pa", name: "Альфа" }),
  ];

  const grouped = formatGroupedTasksList(tasks, { forSelf: true, employeeName: "" });
  assert(grouped.includes("Проект: Альфа"), "section Альфа");
  assert(grouped.includes("Проект: Бета"), "section Бета");
  assert(grouped.indexOf("Проект: Альфа") < grouped.indexOf("Проект: Бета"), "alpha order");
  assert(/Проект: Альфа[\s\S]*?1\. A task/.test(grouped), "renumber 1 in Альфа");
  assert(/Проект: Альфа[\s\S]*?2\. A2/.test(grouped), "renumber 2 in Альфа");
  assert(/Проект: Бета[\s\S]*?1\. B task/.test(grouped), "renumber 1 in Бета");
  assert(!grouped.includes("   Проект:"), "no per-task project line");

  const single = formatGroupedTasksList([tasks[0]!], {
    forSelf: true,
    employeeName: "",
    sectionProjectName: "Бета",
  });
  assert(single.includes("Проект: Бета"), "single section hint");
  assert(!single.includes("Проект: Альфа"), "only one section");

  const many = Array.from({ length: MY_TASKS_LIST_MAX_LIMIT }, (_, i) =>
    task(String(i), `T${i}`, { id: "p1", name: "Альфа" }),
  );
  const withFooter = formatGroupedTasksList(many, { forSelf: true, employeeName: "" });
  assert(withFooter.includes(TASK_LIST_TRUNCATED_FOOTER), "footer at 20");
  const noFooter = formatGroupedTasksList(many.slice(0, 19), { forSelf: true, employeeName: "" });
  assert(!noFooter.includes(TASK_LIST_TRUNCATED_FOOTER), "no footer at 19");

  console.log("[bot] my-tasks-flow dev checks OK");
}
